/* =========================================================
   Rutenda — el día de la vuelta
   El día anterior y el mismo día que volvés: una lista corta
   para dejar el alojamiento (check-out, llaves, cajones…),
   devolver el auto si alquilaste, y a qué hora salir para
   llegar bien al aeropuerto o la terminal.
   ========================================================= */
window.R = window.R || {};

R.vuelta = (function () {
  const U = R.util;
  const { esc } = U;
  const C = () => R.recorrido;
  const ANTES = { avion: 120, avionInter: 180, micro: 30, tren: 30, barco: 60, auto: 0, otro: 30 };

  /** El primer traslado de la vuelta (o null si el viaje es solo de ida). */
  function segVuelta(v) {
    const t = (v.recorrido || []).find(x => x.tipo === 'vuelta');
    return t && t.segmentos && t.segmentos[0] && t.segmentos[0].sale && t.segmentos[0].sale.fecha ? t.segmentos[0] : null;
  }

  function aplica(v) {
    if (v.ejemplo) return false;
    const s = segVuelta(v);
    if (!s) return false;
    const hoy = U.hoyISO();
    if (s.sale.fecha !== hoy && s.sale.fecha !== U.sumarDias(hoy, 1)) return false;
    if (s.sale.fecha === hoy && s.sale.hora) {
      const a = new Date();
      const hhmm = String(a.getHours()).padStart(2, '0') + ':' + String(a.getMinutes()).padStart(2, '0');
      if (hhmm > s.sale.hora) return false;
    }
    return true;
  }

  function minutos() { const p = R.db.prefs().minutosVuelta; return Number.isFinite(p) ? p : 45; }

  /** A qué hora salir del alojamiento. */
  function horaDeSalir(v, s) {
    if (!s || !s.sale.hora) return null;
    const inter = s.medio === 'avion' && v.perfil && v.perfil.internacional;
    const antes = inter ? ANTES.avionInter : (ANTES[s.medio] != null ? ANTES[s.medio] : 30);
    const viaje = s.medio === 'auto' ? 0 : minutos();
    const [h, m] = s.sale.hora.split(':').map(Number);
    const total = h * 60 + m - antes - viaje;
    const t = (total + 1440) % 1440;
    return { hora: String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'), antes, viaje, medio: s.medio, sale: s.sale.hora, diaAntes: total < 0 };
  }

  function items(v, s) {
    const fecha = s.sale.fecha;
    const est = C().estadias(v);
    const e = est.find(x => x.hasta === fecha) || est[est.length - 1];
    const aloj = e && ((v.tareas || {})['a_reserva__' + e.id] || {}).datos;
    const auto = ((v.tareas || {}).mv_auto || {}).datos;
    const lista = [];
    if (e) lista.push({ id: 'checkout', texto: aloj && aloj.checkoutHora ? `Check-out antes de las ${aloj.checkoutHora}${aloj.nombre ? ' (' + aloj.nombre + ')' : ''}` : `Check-out del alojamiento${aloj && aloj.nombre ? ' (' + aloj.nombre + ')' : ''}` });
    if (auto && (auto.devolucionFecha === fecha || auto.devolucionFecha === U.sumarDias(fecha, -1))) {
      lista.push({ id: 'auto', texto: `Devolver el auto${auto.devolucionHora ? ' a las ' + auto.devolucionHora : ''}${auto.devolucionLugar ? ' en ' + auto.devolucionLugar : ''} (con el tanque como lo pidieron)` });
    }
    lista.push(
      { id: 'cajones', texto: 'Revisar cajones, placard, baño, caja fuerte y enchufes' },
      { id: 'cargadores', texto: 'Cargadores, adaptadores y batería externa' },
      { id: 'documentos', texto: (R.requisitos.analizar(v).necesitaPasaporte ? 'Pasaportes' : 'DNI') + ' y pasajes de todos a mano' },
      { id: 'llaves', texto: 'Devolver llaves o tarjetas del alojamiento' }
    );
    const pv = R.valija.progreso(v, 'vuelta');
    lista.push({ id: 'valija', texto: pv.total ? `Valija de vuelta (${pv.hechos} de ${pv.total})` : 'Valija de vuelta', auto: pv.total > 0 && pv.hechos === pv.total, ir: 'valija' });
    return lista;
  }

  function tarjetaHTML(v) {
    if (!aplica(v)) return '';
    const s = segVuelta(v);
    const hoy = U.hoyISO();
    const marcados = v.repasoVuelta || {};
    const lista = items(v, s);
    const hechos = lista.filter(i => i.auto || marcados[i.id]).length;
    const h = horaDeSalir(v, s);
    const m = C().medio(s.medio);
    return `
      <section class="repaso-salida repaso-vuelta bloque" data-repaso-vuelta="${v.id}">
        <div class="rs-cab">
          <div><span class="etiqueta">${s.sale.fecha === hoy ? 'Hoy volvés' : 'Mañana volvés'}</span><h3>Antes de irte</h3></div>
          <span class="chip ${hechos === lista.length ? 'chip-ok' : ''}">${hechos}/${lista.length}</span>
        </div>
        ${h ? `
          <div class="rs-hora">
            <span>🕒 Salí ${s.sale.fecha === hoy ? '' : 'mañana '}a las <strong>${h.hora}</strong></span>
            <small>${esc(m.nombre)} a las ${h.sale} desde ${esc(s.desde.nombre)}${h.antes ? ` · conviene estar ${h.antes >= 120 ? h.antes / 60 + ' h' : h.antes + ' min'} antes` : ''}${h.medio !== 'auto' ? ` · tardás <button type="button" class="btn-texto-mini" data-a="minutosVuelta">${h.viaje} min</button> en llegar` : ''}</small>
          </div>` : `<p class="texto-suave">Cargá la hora de la vuelta y te digo a qué hora salir.</p>`}
        <ul class="rs-lista">${lista.map(i => `
          <li class="${i.auto || marcados[i.id] ? 'hecho' : ''}">
            <label><input type="checkbox" data-vuelta-item="${i.id}" ${i.auto || marcados[i.id] ? 'checked' : ''} ${i.auto ? 'disabled' : ''}> ${esc(i.texto)}</label>
            ${i.ir && !i.auto ? `<a class="btn-texto-mini" href="#viaje/${v.id}/${i.ir}">Ver</a>` : ''}
          </li>`).join('')}</ul>
      </section>`;
  }

  function enlazar(cont, v) {
    const caja = cont.querySelector(`[data-repaso-vuelta="${v.id}"]`);
    if (!caja) return;
    caja.querySelectorAll('[data-vuelta-item]').forEach(x => x.onchange = () => {
      v.repasoVuelta = Object.assign({}, v.repasoVuelta, { [x.dataset.vueltaItem]: x.checked });
      R.db.guardarViaje(v);
      x.closest('li').classList.toggle('hecho', x.checked);
      const lista = items(v, segVuelta(v));
      const hechos = lista.filter(i => i.auto || v.repasoVuelta[i.id]).length;
      const chip = caja.querySelector('.rs-cab .chip');
      chip.textContent = `${hechos}/${lista.length}`;
      chip.classList.toggle('chip-ok', hechos === lista.length);
      if (hechos === lista.length) U.toast('¡Todo listo! Buen regreso 🏠');
    });
    const b = caja.querySelector('[data-a="minutosVuelta"]');
    if (b) b.onclick = () => U.modal({
      titulo: '¿Cuánto tardás en llegar?',
      subtitulo: 'Desde el alojamiento hasta el aeropuerto o la terminal.',
      cuerpo: `<label class="campo"><span>Minutos</span><input id="mvMin" type="number" inputmode="numeric" min="0" max="600" value="${minutos()}"></label>`,
      acciones: [{ texto: 'Cancelar' }, { texto: 'Guardar', clase: 'btn-primario', onClick: el => { R.db.guardarPrefs({ minutosVuelta: Math.max(0, Math.min(600, parseInt(el.querySelector('#mvMin').value, 10) || 0)) }); R.app.refrescar(); } }]
    });
  }

  return { aplica, tarjetaHTML, enlazar, horaDeSalir, segVuelta, items };
})();
