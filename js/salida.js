/* =========================================================
   Rutenda — repaso del día antes de salir
   Aparece el día anterior y el mismo día (antes de partir):
   una lista corta para tildar y a qué hora conviene salir
   de casa según el primer traslado. Todo se calcula acá,
   sin servicios pagos.
   ========================================================= */
window.R = window.R || {};

R.salida = (function () {
  const U = R.util;
  const { esc } = U;

  // Cuánto antes conviene estar, según el medio
  const ANTICIPACION = { avion: 120, avionInter: 180, micro: 30, tren: 30, barco: 60, auto: 0, otro: 30 };

  function primerTraslado(v) {
    const x = R.recorrido.todosLosSegmentos(v.recorrido || [])[0];
    return x ? x.seg : null;
  }

  /** ¿Toca mostrar el repaso? (desde el día anterior hasta que salís) */
  function aplica(v) {
    if (v.ejemplo || !v.fechaInicio) return false;
    const hoy = U.hoyISO();
    if (v.fechaInicio !== hoy && v.fechaInicio !== U.sumarDias(hoy, 1)) return false;
    const s = primerTraslado(v);
    if (v.fechaInicio === hoy && s && s.sale.hora) {
      const ahora = new Date();
      const hhmm = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
      if (hhmm > s.sale.hora) return false;
    }
    return true;
  }

  /** Hora para salir de casa: hora del traslado − anticipación − lo que tardás en llegar. */
  function horaDeSalir(v) {
    const s = primerTraslado(v);
    if (!s || !s.sale.hora) return null;
    const inter = s.medio === 'avion' && v.perfil && v.perfil.internacional;
    const antes = inter ? ANTICIPACION.avionInter : (ANTICIPACION[s.medio] != null ? ANTICIPACION[s.medio] : 30);
    const viaje = s.medio === 'auto' ? 0 : minutosHasta();
    const [h, m] = s.sale.hora.split(':').map(Number);
    let total = h * 60 + m - antes - viaje;
    const diaAntes = total < 0;
    total = (total + 1440) % 1440;
    return {
      hora: String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0'),
      diaAntes, antes, viaje, medio: s.medio, sale: s.sale.hora, desde: s.desde.nombre
    };
  }
  function minutosHasta() {
    const p = R.db.prefs().minutosAlPunto;
    return Number.isFinite(p) ? p : 45;
  }

  function items(v) {
    const req = R.requisitos.analizar(v);
    const s = primerTraslado(v);
    const lista = [
      { id: 'documento', texto: req.necesitaPasaporte ? 'Pasaporte de todos (y visas o permisos)' : 'DNI de todos, vigente' },
      { id: 'pasajes', texto: 'Pasajes y reservas a mano en el celular' }
    ];
    if (s && s.medio === 'avion') {
      const checkin = R.motor.analizar(v).find(t => t.base === 's_checkin' && t.ctx && t.ctx.seg && t.ctx.seg.id === s.id);
      lista.push({ id: 'checkin', texto: 'Check-in hecho', auto: !!(checkin && checkin.resuelta), tarea: checkin && !checkin.resuelta ? checkin.id : '' });
    }
    lista.push(
      { id: 'cargadores', texto: 'Celular cargado, cargadores y batería externa' },
      { id: 'plata', texto: v.perfil && v.perfil.internacional ? 'Tarjetas habilitadas y algo de efectivo' : 'Tarjetas y algo de efectivo' },
      { id: 'remedios', texto: 'Medicación habitual' }
    );
    const pv = R.valija.progreso(v, 'ida');
    lista.push({ id: 'valija', texto: pv.total ? `Valija lista (${pv.hechos} de ${pv.total})` : 'Valija lista', auto: pv.total > 0 && pv.hechos === pv.total, ir: 'valija' });
    lista.push({ id: 'casa', texto: 'Casa: luces, llaves, basura y ventanas' });
    return lista;
  }

  function tarjetaHTML(v) {
    if (!aplica(v)) return '';
    const hoy = U.hoyISO();
    const marcados = v.repasoSalida || {};
    const lista = items(v);
    const hechos = lista.filter(i => i.auto || marcados[i.id]).length;
    const h = horaDeSalir(v);
    const medio = h ? (R.recorrido.MEDIOS[h.medio] || {}).nombre || '' : '';
    return `
      <section class="repaso-salida bloque">
        <div class="rs-cab">
          <div>
            <span class="etiqueta">${v.fechaInicio === hoy ? 'Hoy salís' : 'Mañana salís'}</span>
            <h3>Repaso antes de viajar</h3>
          </div>
          <span class="chip ${hechos === lista.length ? 'chip-ok' : ''}">${hechos}/${lista.length}</span>
        </div>
        ${h ? `
          <div class="rs-hora">
            <span>🕒 Salí de casa a las <strong>${h.hora}</strong>${h.diaAntes ? ' (el día anterior)' : ''}</span>
            <small>${esc(medio)} a las ${h.sale}${h.antes ? ` · conviene estar ${h.antes >= 120 ? h.antes / 60 + ' h' : h.antes + ' min'} antes` : ''}${h.medio !== 'auto' ? ` · tardás <button type="button" class="btn-texto-mini" data-a="minutos">${h.viaje} min</button> en llegar` : ''}</small>
          </div>` : ''}
        <ul class="rs-lista">${lista.map(i => `
          <li class="${i.auto || marcados[i.id] ? 'hecho' : ''}">
            <label><input type="checkbox" data-repaso="${i.id}" ${i.auto || marcados[i.id] ? 'checked' : ''} ${i.auto ? 'disabled' : ''}> ${esc(i.texto)}</label>
            ${i.tarea ? `<button type="button" class="btn-texto-mini" data-repaso-tarea="${i.tarea}">Hacerlo</button>` : ''}
            ${i.ir && !i.auto ? `<a class="btn-texto-mini" href="#viaje/${v.id}/${i.ir}">Ver</a>` : ''}
          </li>`).join('')}</ul>
      </section>`;
  }

  function enlazar(cont, v) {
    cont.querySelectorAll('[data-repaso]').forEach(x => x.onchange = () => {
      v.repasoSalida = Object.assign({}, v.repasoSalida, { [x.dataset.repaso]: x.checked });
      R.db.guardarViaje(v);
      x.closest('li').classList.toggle('hecho', x.checked);
      const lista = items(v);
      const hechos = lista.filter(i => i.auto || v.repasoSalida[i.id]).length;
      const chip = x.closest('.repaso-salida').querySelector('.rs-cab .chip');
      chip.textContent = `${hechos}/${lista.length}`;
      chip.classList.toggle('chip-ok', hechos === lista.length);
      if (hechos === lista.length) U.toast('¡Todo listo! Buen viaje ✈️');
    });
    cont.querySelectorAll('[data-repaso-tarea]').forEach(b => b.onclick = () => R.vistaGuia.abrirTarea(v, b.dataset.repasoTarea));
    const bMin = cont.querySelector('.repaso-salida [data-a="minutos"]');
    if (bMin) bMin.onclick = () => {
      U.modal({
        titulo: '¿Cuánto tardás en llegar?',
        subtitulo: 'Desde tu casa hasta el aeropuerto o la terminal. Lo uso para calcular a qué hora salir.',
        cuerpo: `<label class="campo"><span>Minutos</span><input id="rsMin" type="number" inputmode="numeric" min="0" max="600" value="${minutosHasta()}"></label>`,
        acciones: [{ texto: 'Cancelar' }, {
          texto: 'Guardar', clase: 'btn-primario', onClick: el => {
            const n = Math.max(0, Math.min(600, parseInt(el.querySelector('#rsMin').value, 10) || 0));
            R.db.guardarPrefs({ minutosAlPunto: n });
            R.app.refrescar();
          }
        }]
      });
    };
  }

  return { aplica, tarjetaHTML, enlazar, horaDeSalir, items };
})();
