/* =========================================================
   Rutenda — editor del cronograma
   Línea de tiempo editable: cada traslado con su medio, fecha y
   hora de salida y llegada; paradas con "¿hacés noche?";
   estadías con noches calculadas (− / +) y escapadas.
   Se usa en el asistente de viaje y en el Itinerario.
   Trabaja sobre un borrador { origen, destinos, recorrido, sinFechas }.
   ========================================================= */
window.R = window.R || {};

R.cronogramaEditor = (function () {
  const U = R.util;
  const { esc } = U;
  const C = () => R.recorrido;

  /**
   * opciones: { permitirSinFechas, alCambiar(borrador), tareas }
   * Devuelve { pintar }.
   */
  function montar(cont, b, opciones) {
    const op = opciones || {};
    let paradaAbierta = null;
    let avisoEspejo = false;
    let campoParada = null;
    if (b.moverJunto == null) b.moverJunto = true;

    const ctxViaje = () => ({ recorrido: b.recorrido, destinos: b.destinos, tareas: op.tareas || {}, fechaInicio: '', fechaFin: '' });

    function pintar() {
      const M = C().MEDIOS;
      const v = ctxViaje();
      C().autocompletar(b.recorrido);
      C().recalcular(v);
      const est = C().estadias(v);
      const avisos = b.sinFechas ? [] : C().validar(v);
      const tramos = b.recorrido;

      if (!tramos.length) {
        cont.innerHTML = '<p class="texto-suave">Cargá al menos un destino para armar el cronograma.</p>';
        return;
      }

      const bloques = [];
      bloques.push(`<div class="cr-hito"><span class="cr-punto">🏠</span><div><strong>Salís de ${esc((b.origen && b.origen.nombre) || 'tu ciudad')}</strong>${!(b.origen && b.origen.nombre) ? '<small>Cargá tu ciudad de salida para sumar la ida y la vuelta.</small>' : ''}</div></div>`);

      tramos.forEach((t, ti) => {
        t.segmentos.forEach((s, si) => {
          bloques.push(segmentoHTML(t, ti, s, si, M));
          if (si < t.segmentos.length - 1) bloques.push(paradaHTML(t, ti, s, si));
        });
        if (paradaAbierta === ti) {
          bloques.push(`<div class="cr-agregar-parada"><div id="crLugarParada"></div>
            <div class="acciones-fila"><button type="button" class="btn btn-primario btn-chico" data-cr="confirmarParada">Agregar parada</button><button type="button" class="btn btn-texto btn-chico" data-cr="cancelarParada">Cancelar</button></div></div>`);
        } else {
          bloques.push(`<button type="button" class="btn btn-texto btn-chico cr-btn-parada" data-cr-parada="${ti}">+ Pasar por otra ciudad en este tramo</button>`);
        }
        if (t.tipo !== 'vuelta') {
          const e = est.find(x => x.id === t.destId);
          if (e) bloques.push(estadiaHTML(t, ti, e));
        }
      });

      const tieneVuelta = tramos.some(t => t.tipo === 'vuelta');
      const ultimo = tramos[tramos.length - 1].segmentos.slice(-1)[0];
      if (tieneVuelta) bloques.push(`<div class="cr-hito"><span class="cr-punto">🏠</span><div><strong>Llegás a casa${!b.sinFechas && C().fechaLlega(ultimo) ? ' el ' + U.fmtFecha(C().fechaLlega(ultimo), 'largo') : ''}</strong></div></div>`);

      cont.innerHTML = `
        ${op.permitirSinFechas ? `<label class="check"><input type="checkbox" data-cr="sinFechas" ${b.sinFechas ? 'checked' : ''}> Todavía no tengo fechas (las cargo después)</label>` : ''}
        ${!b.sinFechas ? `<label class="check cr-mover"><input type="checkbox" data-cr="moverJunto" ${b.moverJunto ? 'checked' : ''}> Si cambio una fecha, mover también lo que sigue</label>` : ''}
        <div class="cronograma ${b.sinFechas ? 'sin-fechas' : ''}">${bloques.join('')}</div>
        ${avisos.length ? `<div class="cr-avisos">${avisos.map(a => `<p class="cr-aviso cr-${a.nivel}">${a.nivel === 'error' ? '⛔' : a.nivel === 'aviso' ? '⚠️' : 'ℹ️'} ${esc(a.texto)}</p>`).join('')}</div>` : ''}`;
      enlazar();
      if (op.alCambiar) op.alCambiar(b);
    }

    function segmentoHTML(t, ti, s, si, M) {
      const clave = `${ti}|${si}`;
      const est = C().ESTADOS[s.estado] || C().ESTADOS.a_definir;
      const dur = C().duracion(s);
      const nocturno = s.sale.fecha && s.llega.fecha && s.llega.fecha > s.sale.fecha;
      return `
        <div class="cr-seg" data-seg="${s.id}">
          <div class="cr-seg-cab">
            <span class="tr-tipo tr-${t.tipo}">${C().TIPOS_TRAMO[t.tipo]}${t.segmentos.length > 1 ? ` · ${si + 1}/${t.segmentos.length}` : ''}</span>
            <strong>${esc(s.desde.nombre || '¿?')} → ${esc(s.hasta.nombre || '¿?')}</strong>
            ${b.sinFechas ? '' : `<span class="cr-estado ${est.clase}">${s.estado === 'confirmado' ? '✓ ' : ''}${est.nombre}</span>`}
          </div>
          <div class="medios">${Object.entries(M).map(([k, m]) =>
            `<button type="button" class="chip-medio ${s.medio === k ? 'activo' : ''}" data-cr-medio="${clave}|${k}" title="${m.nombre}"><span>${m.icono}</span>${m.nombre.replace(' / ferry', '').replace(' propio', '')}</button>`).join('')}</div>
          ${s.medio === 'otro' ? `<input class="campo-otro" data-cr-otro="${clave}" value="${esc(s.medioOtro || '')}" placeholder="¿Cuál? Ej: combi, motorhome, bici">` : ''}
          ${b.sinFechas ? '' : `
          <div class="cr-horarios">
            <div class="cr-hora"><small>Sale</small><input type="date" data-cr-f="${clave}|sale|fecha" value="${esc(s.sale.fecha)}"><input type="time" data-cr-f="${clave}|sale|hora" value="${esc(s.sale.hora)}"></div>
            <div class="cr-hora"><small>Llega</small><input type="date" data-cr-f="${clave}|llega|fecha" value="${esc(s.llega.fecha)}" min="${esc(s.sale.fecha)}"><input type="time" data-cr-f="${clave}|llega|hora" value="${esc(s.llega.hora)}"></div>
          </div>
          <p class="cr-nota">${[
            dur != null && dur >= 0 ? `⏱ ${C().fmtDuracion(dur)} de viaje` : '',
            nocturno ? '🌙 Viajás de noche' : '',
            s.desde.zona && s.hasta.zona && C().difHoraria(s) ? `🕒 Hora local en cada ciudad` : '',
            !s.sale.hora ? 'La hora es opcional' : ''
          ].filter(Boolean).join(' · ')}</p>`}
        </div>`;
    }

    function paradaHTML(t, ti, s, si) {
      const sig = t.segmentos[si + 1];
      const noches = s.noche && C().fechaLlega(s) && sig.sale.fecha ? U.diasEntre(C().fechaLlega(s), sig.sale.fecha) : null;
      return `
        <div class="cr-parada">
          <span class="cr-punto">📍</span>
          <div>
            <strong>${esc(s.hasta.nombre)}</strong>
            <div class="cr-noche">¿Hacés noche acá?
              <span class="segmentado segmentado-chico">
                <button type="button" data-cr-noche="${ti}|${si}|no" class="${!s.noche ? 'activo' : ''}">No</button>
                <button type="button" data-cr-noche="${ti}|${si}|si" class="${s.noche ? 'activo' : ''}">Sí${noches ? ` · ${U.plural(noches, 'noche', 'noches')}` : ''}</button>
              </span>
            </div>
            <button type="button" class="btn-texto-mini" data-cr-unir="${ti}|${si}">Quitar esta parada</button>
          </div>
        </div>`;
    }

    function estadiaHTML(t, ti, e) {
      const escapadas = (b.destinos || []).filter(d => d.soloDia && d.nombre && d.base === e.id);
      const diasEstadia = [];
      if (e.desde && e.hasta) for (let f = e.desde; f <= e.hasta; f = U.sumarDias(f, 1)) diasEstadia.push(f);
      const dest = (b.destinos || []).find(d => d.id === e.id);
      if (dest && dest.dePaso) return `
        <div class="cr-estadia cr-de-paso">
          <span class="cr-punto">📍</span>
          <div class="cr-estadia-cuerpo">
            <strong>${esc(e.nombre)} <span class="chip chip-gris">De paso</span></strong>
            <small>${e.desde ? 'Pasás el ' + U.fmtFecha(e.desde, 'dia') + ', ' : ''}sin hacer noche: no te pido alojamiento.</small>
            <button type="button" class="btn-texto-mini" data-cr-depaso="${e.id}|no">Hago noche acá</button>
          </div>
        </div>`;
      const mismoDia = !b.sinFechas && e.desde && e.hasta && e.noches === 0;
      return `
        <div class="cr-estadia">
          <span class="cr-punto">🏡</span>
          <div class="cr-estadia-cuerpo">
            <strong>${esc(e.nombre)}</strong>
            ${mismoDia ? `<div class="cr-noche cr-pregunta-paso">Llegás y te vas el mismo día. ¿Dormís acá?
              <span class="segmentado segmentado-chico">
                <button type="button" data-cr-noches="${ti}|1">Sí, sumo una noche</button>
                <button type="button" data-cr-depaso="${e.id}|si">No, es de paso</button>
              </span></div>` : ''}
            ${b.sinFechas ? '<small>Las noches se calculan cuando cargues las fechas.</small>' : `
            <div class="cr-noches">
              <span>${e.desde ? 'Llegás el ' + U.fmtFecha(e.desde, 'corto') : 'Llegada a definir'}</span>
              <span class="cr-contador">
                <button type="button" class="btn-icono" data-cr-noches="${ti}|-1" aria-label="Una noche menos" ${!e.desde || !e.noches ? 'disabled' : ''}>−</button>
                <strong>${e.noches != null ? U.plural(e.noches, 'noche', 'noches') : '— noches'}</strong>
                <button type="button" class="btn-icono" data-cr-noches="${ti}|1" aria-label="Una noche más" ${!e.desde ? 'disabled' : ''}>+</button>
              </span>
              <span>${e.hasta ? 'Te vas el ' + U.fmtFecha(e.hasta, 'corto') : ''}</span>
            </div>`}
            ${escapadas.map(d => `
              <div class="cr-escapada">☀️ Escapada a <strong>${esc(d.nombre)}</strong>
                <select data-cr-escapada="${d.id}">
                  <option value="">Día a definir</option>
                  ${diasEstadia.map(f => `<option value="${f}" ${d.fecha === f && !d.fechaPendiente ? 'selected' : ''}>${U.fmtFecha(f, 'dia')}</option>`).join('')}
                </select>
              </div>`).join('')}
          </div>
        </div>`;
    }

    /* ---------- Acciones ---------- */
    function seg(clave) {
      const [ti, si] = clave.split('|').map(Number);
      return b.recorrido[ti].segmentos[si];
    }
    function moverSiguientes(s, delta) {
      if (!delta || !b.moverJunto) return 0;
      return C().desplazarDesde(ctxViaje(), s.id, delta);
    }

    function enlazar() {
      const q = sel => cont.querySelectorAll(sel);
      const chk = cont.querySelector('[data-cr="sinFechas"]');
      if (chk) chk.onchange = () => { b.sinFechas = chk.checked; pintar(); };
      const mover = cont.querySelector('[data-cr="moverJunto"]');
      if (mover) mover.onchange = () => { b.moverJunto = mover.checked; };

      q('[data-cr-medio]').forEach(x => x.onclick = () => {
        const [ti, si, m] = x.dataset.crMedio.split('|');
        const s = seg(`${ti}|${si}`);
        s.medio = m;
        if (s.estado === 'confirmado') s.estado = 'estimado';
        if (C().espejarMedio(b.recorrido, s, b.recorrido[Number(ti)]) && !avisoEspejo) { avisoEspejo = true; U.toast('Cambié también el medio de la vuelta (podés cambiarlo aparte).'); }
        pintar();
        if (m === 'otro') { const i = cont.querySelector(`[data-cr-otro="${ti}|${si}"]`); if (i) i.focus(); }
      });
      q('[data-cr-otro]').forEach(x => x.oninput = () => { seg(x.dataset.crOtro).medioOtro = x.value.trim(); });

      // Fechas y horas: se aplican al salir del campo (no se pierde el foco mientras escribís)
      q('[data-cr-f]').forEach(x => x.onblur = () => {
        const [ti, si, cual, campo] = x.dataset.crF.split('|');
        const s = seg(`${ti}|${si}`);
        const antes = s[cual][campo];
        if (antes === x.value) return;
        const llegadaAntes = C().fechaLlega(s);
        s[cual][campo] = x.value;
        if (campo === 'fecha' && cual === 'sale' && s.llega.fecha && antes && x.value) {
          // Mantener la duración del traslado
          s.llega.fecha = U.sumarDias(s.llega.fecha, U.diasEntre(antes, x.value));
        }
        if (s.estado === 'confirmado') s.estado = 'estimado';
        if (campo === 'fecha' && llegadaAntes && C().fechaLlega(s) && llegadaAntes !== C().fechaLlega(s)) {
          const n = moverSiguientes(s, U.diasEntre(llegadaAntes, C().fechaLlega(s)));
          if (n) U.toast(n === 1 ? 'Moví también el traslado que sigue.' : `Moví también los ${n} traslados que siguen.`);
        }
        pintar();
      });

      q('[data-cr-noche]').forEach(x => x.onclick = () => {
        const [ti, si, val] = x.dataset.crNoche.split('|');
        const s = seg(`${ti}|${si}`);
        const sig = b.recorrido[Number(ti)].segmentos[Number(si) + 1];
        s.noche = val === 'si';
        // Si hacés noche y la siguiente parte salía el mismo día, pasa al día siguiente
        if (s.noche && sig.sale.fecha && sig.sale.fecha === C().fechaLlega(s)) {
          const antes = C().fechaLlega(sig);
          sig.sale.fecha = U.sumarDias(sig.sale.fecha, 1);
          if (sig.llega.fecha) sig.llega.fecha = U.sumarDias(sig.llega.fecha, 1);
          moverSiguientes(sig, U.diasEntre(antes, C().fechaLlega(sig)));
        }
        pintar();
      });
      q('[data-cr-unir]').forEach(x => x.onclick = () => {
        const [ti, si] = x.dataset.crUnir.split('|').map(Number);
        const t = b.recorrido[ti];
        const nombre = t.segmentos[si].hasta.nombre;
        if (C().desespejarParada(b.recorrido, t, si)) U.toast(`Saqué ${nombre} también de la vuelta.`);
        C().unir(t, si);
        pintar();
      });
      q('[data-cr-parada]').forEach(x => x.onclick = () => { paradaAbierta = Number(x.dataset.crParada); pintar(); });
      const cp = cont.querySelector('#crLugarParada');
      if (cp) { campoParada = R.lugares.campo(cp, { placeholder: 'Ciudad por la que pasás (ej: Buenos Aires)' }); campoParada.input.focus(); }
      const conf = cont.querySelector('[data-cr="confirmarParada"]');
      if (conf) conf.onclick = () => {
        const l = campoParada.obtener();
        if (!l.nombre) { U.toast('Escribí la ciudad por la que pasás.'); return; }
        const t = b.recorrido[paradaAbierta];
        // La parada va antes del destino (o justo después de tu casa en la ida, si es tu conexión)
        const idx = t.segmentos.length - 1;
        C().dividir(t, idx, l);
        if (C().espejarParada(b.recorrido, t, idx)) U.toast(`También la sumé a la vuelta. Si volvés por otro lado, quitala ahí.`);
        paradaAbierta = null;
        pintar();
      };
      const canc = cont.querySelector('[data-cr="cancelarParada"]');
      if (canc) canc.onclick = () => { paradaAbierta = null; pintar(); };

      q('[data-cr-noches]').forEach(x => x.onclick = () => {
        const [ti, delta] = x.dataset.crNoches.split('|').map(Number);
        const dest = (b.destinos || []).find(d => d.id === b.recorrido[ti].destId);
        if (dest && delta > 0) dest.dePaso = false;
        const llegaTramo = b.recorrido[ti];
        const ultimoSeg = llegaTramo.segmentos[llegaTramo.segmentos.length - 1];
        const sale = b.recorrido[ti + 1];
        if (!sale) return;
        const primero = sale.segmentos[0];
        if (!primero.sale.fecha) {
          primero.sale.fecha = U.sumarDias(C().fechaLlega(ultimoSeg), Math.max(1, delta));
          primero.estado = 'estimado';
        } else if (b.moverJunto) {
          // Una noche más o menos corre todo lo que sigue
          C().desplazarDesde(ctxViaje(), ultimoSeg.id, delta);
        } else {
          // Solo cambia la salida de este destino (el resto queda igual)
          sale.segmentos.forEach(z => {
            if (z.sale.fecha) z.sale.fecha = U.sumarDias(z.sale.fecha, delta);
            if (z.llega.fecha) z.llega.fecha = U.sumarDias(z.llega.fecha, delta);
            if (z.estado === 'confirmado') z.estado = 'estimado';
          });
        }
        pintar();
      });
      q('[data-cr-depaso]').forEach(x => x.onclick = () => {
        const [id, val] = x.dataset.crDepaso.split('|');
        const d = (b.destinos || []).find(y => y.id === id);
        if (!d) return;
        d.dePaso = val === 'si';
        if (d.dePaso) U.toast(`${d.nombre} quedó de paso: no te pido alojamiento ahí.`);
        pintar();
      });
      q('[data-cr-escapada]').forEach(x => x.onchange = () => {
        const d = b.destinos.find(y => y.id === x.dataset.crEscapada);
        d.fecha = x.value;
        d.fechaPendiente = !x.value;
        pintar();
      });
    }

    pintar();
    return { pintar };
  }

  /** Vista compacta (solo lectura) para el Itinerario y el inicio. */
  function resumenHTML(v) {
    const C2 = R.recorrido;
    const items = [];
    const tramos = v.recorrido || [];
    if (!tramos.length) return '';
    const est = C2.estadias(v);
    if (v.origen && v.origen.nombre) items.push(`<li class="crr-hito">🏠 <span>${esc(v.origen.nombre)}</span></li>`);
    tramos.forEach(t => {
      t.segmentos.forEach((s, i) => {
        const e = C2.ESTADOS[s.estado] || C2.ESTADOS.a_definir;
        const det = datosSegmento(v, s);
        items.push(`<li class="crr-seg">
          <span class="crr-medio">${C2.medio(s.medio).icono}</span>
          <div><strong>${esc(s.desde.nombre)} → ${esc(s.hasta.nombre)}</strong>
            <small>${s.sale.fecha ? `${U.fmtFecha(s.sale.fecha, 'dia')}${s.sale.hora ? ' ' + s.sale.hora : ''}${C2.fechaLlega(s) !== s.sale.fecha || s.llega.hora ? ` → ${C2.fechaLlega(s) !== s.sale.fecha ? U.fmtFecha(C2.fechaLlega(s), 'dia') + ' ' : ''}${s.llega.hora || ''}` : ''}` : 'Fecha a definir'}${det ? ' · ' + esc(det) : ''}</small></div>
          <span class="cr-estado ${e.clase}">${s.estado === 'confirmado' ? '✓' : e.nombre}</span>
        </li>`);
        if (i < t.segmentos.length - 1) items.push(`<li class="crr-hito">📍 <span>${esc(s.hasta.nombre)}${s.noche ? ' · hacés noche' : ''}</span></li>`);
      });
      const e = t.tipo !== 'vuelta' ? est.find(x => x.id === t.destId) : null;
      if (e) items.push(`<li class="crr-estadia">🏡 <span><strong>${esc(e.nombre)}</strong>${e.noches != null ? ` · ${U.plural(e.noches, 'noche', 'noches')}` : ''}</span></li>`);
    });
    if (tramos.some(t => t.tipo === 'vuelta')) items.push(`<li class="crr-hito">🏠 <span>Llegás a casa</span></li>`);
    return `<ol class="cronograma-resumen">${items.join('')}</ol>`;
  }

  /** Empresa, número y código del pasaje cargado (si hay). */
  function datosSegmento(v, s) {
    const t = v.tareas && v.tareas['t_segmento__' + s.id];
    const d = t && t.datos;
    if (!d || !d.tramos || !d.tramos.length) return '';
    const p = d.tramos[0];
    return [[p.empresa, p.numero].filter(Boolean).join(' '), p.desdeAeropuerto && p.hastaAeropuerto ? `${p.desdeAeropuerto}→${d.tramos[d.tramos.length - 1].hastaAeropuerto || ''}` : '', d.codigo ? 'Cód. ' + d.codigo : ''].filter(Boolean).join(' · ');
  }

  return { montar, resumenHTML, datosSegmento };
})();
