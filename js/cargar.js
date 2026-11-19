/* =========================================================
   Rutenda — "Cargar" (botón del medio, abajo)
   Lo que más se carga, a un toque y sin entrar al viaje:
   un gasto, un pendiente, una idea, algo para la valija…
   - Si estás viajando (o mirando un viaje), ya viene elegido.
   - Si tenés varios viajes, elegís a cuál va.
   ========================================================= */
window.R = window.R || {};

R.cargar = (function () {
  const U = R.util;
  const { esc } = U;
  let elegido = '';

  const nombreViaje = v => v.nombre || (v.destinos || []).filter(d => d.nombre && !d.soloDia).map(d => d.nombre).join(' → ') || v.destino || 'Viaje';

  /** Viajes a los que tiene sentido cargarles algo: los próximos, el que estás haciendo y los que terminaron hace poco. */
  function viajesActivos() {
    const hoy = U.hoyISO();
    const hace15 = U.sumarDias(hoy, -15);
    const est = v => R.viajes.estadoViaje(v);
    const peso = v => est(v) === 'en_curso' ? 0 : est(v) === 'planificando' ? 1 : 2;
    return R.db.viajes()
      .filter(v => !v.ejemplo && (est(v) !== 'pasado' || (v.fechaFin && v.fechaFin >= hace15)))
      .sort((a, b) => peso(a) - peso(b)
        || (peso(a) === 2 ? (b.fechaFin || '').localeCompare(a.fechaFin || '') : (a.fechaInicio || '9999').localeCompare(b.fechaInicio || '9999')));
  }

  /** El viaje que va por defecto: el que estás mirando, el que estás haciendo, o el único que hay. */
  function predeterminado(lista) {
    const m = /^#viaje\/([^/]+)/.exec(location.hash || '');
    if (m && lista.some(v => v.id === m[1])) return m[1];
    const enCurso = lista.filter(v => R.viajes.estadoViaje(v) === 'en_curso');
    if (enCurso.length === 1) return enCurso[0].id;
    if (lista.length === 1) return lista[0].id;
    return '';
  }

  function cuando(v) {
    const e = R.viajes.estadoViaje(v);
    if (e === 'en_curso') return '✈️ Viajando ahora';
    if (e === 'pasado') return 'Ya volviste';
    return v.fechaInicio ? U.fmtFecha(v.fechaInicio, 'dia') : 'Sin fecha';
  }

  function cuerpoHTML(lista) {
    const v = lista.find(x => x.id === elegido);
    const org = v ? R.db.puedeOrganizar(v) : true;
    const des = v ? '' : 'disabled';
    const boton = (id, icono, texto, clase) => `<button type="button" class="cargar-op ${clase || ''}" data-cargar="${id}" ${des}><span class="cargar-icono">${icono}</span><span>${texto}</span></button>`;
    return `
      ${lista.length > 1 ? `
        <p class="cargar-pregunta">¿En qué viaje?</p>
        <div class="cargar-viajes" role="radiogroup" aria-label="Viaje">${lista.map(x => `
          <button type="button" role="radio" aria-checked="${x.id === elegido}" class="cargar-viaje ${x.id === elegido ? 'activo' : ''}" data-viaje="${x.id}">
            <span class="punto" style="background:${R.paisaje.fondo(x)}"></span>
            <span class="cv-texto"><strong>${esc(nombreViaje(x))}</strong><small>${esc(cuando(x))}</small></span>
          </button>`).join('')}</div>
        ${v ? '' : '<p class="ayuda cargar-ayuda">Elegí el viaje y después qué querés cargar.</p>'}` : `
        <p class="cargar-en">En <strong>${esc(nombreViaje(v))}</strong> · ${esc(cuando(v))}</p>`}
      <div class="cargar-grilla">
        ${boton('gasto', '−', 'Gasto', 'cg-gasto')}
        ${boton('ingreso', '+', 'Ingreso o reintegro', 'cg-ingreso')}
        ${org ? boton('pendiente', '✅', 'Un pendiente') : ''}
        ${org ? boton('idea', '💡', 'Algo que quiero hacer') : ''}
        ${org ? boton('itinerario', '🗓️', 'Algo en un día') : ''}
        ${org ? boton('reserva', '🎫', 'Una reserva', 'cg-reserva') : ''}
        ${boton('valija', '🧳', 'Algo para la valija')}
        ${boton('doc', '📄', 'Un archivo')}
      </div>
      <form class="cargar-texto" data-form="cargarTexto" hidden>
        <label class="campo"><span id="ctPregunta"></span><input id="ctTexto" maxlength="120" autocomplete="off"></label>
        <div class="acciones-fila"><button type="button" class="btn btn-texto" data-a="ctCancelar">Cancelar</button><button type="submit" class="btn btn-primario">✓ Agregar</button></div>
      </form>`;
  }

  function abrir() {
    const lista = viajesActivos();
    if (!lista.length) {
      const { el } = U.modal({
        titulo: 'Cargar',
        cuerpo: U.vacio({ icono: '🧳', titulo: 'Primero armá un viaje', texto: 'Después cargás gastos, documentos y todo lo demás desde acá.', boton: '+ Nuevo viaje', accion: 'nuevoViaje' })
      });
      el.querySelector('[data-a="nuevoViaje"]').onclick = () => { U.cerrarModal(); R.viajes.nuevo(); };
      return;
    }
    // Si no hay uno obvio, no adivinamos: elegís vos el viaje
    elegido = predeterminado(lista);
    const { el } = U.modal({ titulo: 'Cargar', subtitulo: 'Elegí qué querés sumar.', cuerpo: '<div class="cargar"></div>' });
    const caja = el.querySelector('.cargar');
    const pintar = () => { caja.innerHTML = cuerpoHTML(lista); enlazar(caja, lista, pintar); };
    pintar();
  }

  function enlazar(caja, lista, pintar) {
    caja.querySelectorAll('[data-viaje]').forEach(b => b.onclick = () => { elegido = b.dataset.viaje; pintar(); });
    const v = () => lista.find(x => x.id === elegido);
    const salirY = fn => () => { const vi = v(); if (!vi) return; U.cerrarModal(); fn(vi); };
    let modo = '';
    const f = caja.querySelector('[data-form="cargarTexto"]');
    const PREGUNTAS = {
      pendiente: ['¿Qué tenés que hacer?', 'Ej: Sacar el seguro'],
      idea: ['¿Qué querés hacer allá?', 'Ej: Cerro Catedral'],
      valija: ['¿Qué sumás a la valija?', 'Ej: Cargador']
    };
    const pedirTexto = m => () => {
      if (!v()) return;
      modo = m;
      f.hidden = false;
      caja.querySelector('.cargar-grilla').hidden = true;
      f.querySelector('#ctPregunta').textContent = PREGUNTAS[m][0];
      const i = f.querySelector('#ctTexto');
      i.placeholder = PREGUNTAS[m][1];
      i.focus();
    };
    const acciones = {
      gasto: salirY(vi => R.gastos.nuevo(vi)),
      ingreso: salirY(vi => R.gastos.nuevoIngreso(vi)),
      doc: salirY(vi => R.documentos.subir(vi)),
      reserva: salirY(vi => R.importar.elegir(vi)),
      itinerario: salirY(vi => R.itinerario.editarItem(vi, null, { fecha: R.viajes.estadoViaje(vi) === 'en_curso' ? U.hoyISO() : (vi.fechaInicio || '') })),
      pendiente: pedirTexto('pendiente'),
      idea: pedirTexto('idea'),
      valija: pedirTexto('valija')
    };
    caja.querySelectorAll('[data-cargar]').forEach(b => b.onclick = acciones[b.dataset.cargar]);
    f.onsubmit = e => {
      e.preventDefault();
      const vi = v();
      const texto = f.querySelector('#ctTexto').value.trim();
      if (!vi || !texto) { f.querySelector('#ctTexto').focus(); return; }
      if (modo === 'valija') {
        if (!R.valija.agregar(vi, texto)) { U.toast('Ya estaba en la valija.'); return; }
        U.toast(`Sumado a la valija de ${nombreViaje(vi)}.`);
      } else if (modo === 'pendiente') {
        R.pendientes.sumar(vi, texto);
        R.db.guardarViaje(vi);
        U.toast(`Sumado a Pendientes de ${nombreViaje(vi)}.`);
      } else {
        R.agenda.guardarItem(vi, R.agenda.nuevoItem({ titulo: texto, fecha: '' }));
        R.db.guardarViaje(vi);
        U.toast('Anotado en "Quiero hacer allá". Elegí el día cuando sepas.');
      }
      U.cerrarModal();
      R.app.refrescar();
    };
    f.querySelector('[data-a="ctCancelar"]').onclick = pintar;
  }

  return { abrir, viajesActivos, predeterminado };
})();
