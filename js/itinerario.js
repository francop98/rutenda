/* =========================================================
   Tripbox — pestaña Itinerario
   Línea de tiempo día por día: vuelos, traslados, alojamiento,
   actividades y comidas.
   ========================================================= */
window.R = window.R || {};

R.itinerario = (function () {
  const U = R.util;
  const { esc } = U;

  const TIPOS = [
    { id: 'vuelo', nombre: 'Viaje / vuelo', icono: '✈️' },
    { id: 'traslado', nombre: 'Traslado', icono: '🚕' },
    { id: 'alojamiento', nombre: 'Alojamiento', icono: '🏡' },
    { id: 'actividad', nombre: 'Actividad', icono: '🌄' },
    { id: 'comida', nombre: 'Comida', icono: '🍽️' },
    { id: 'otro', nombre: 'Otro', icono: '📌' }
  ];
  function tipo(id) { return TIPOS.find(t => t.id === id) || TIPOS[TIPOS.length - 1]; }

  function diasDelViaje(v) {
    if (!v.fechaInicio) return [];
    const fin = v.fechaFin || v.fechaInicio;
    const total = Math.min(U.diasEntre(v.fechaInicio, fin), 120);
    const dias = [];
    for (let i = 0; i <= total; i++) dias.push(U.sumarDias(v.fechaInicio, i));
    return dias;
  }

  /** Dónde estás ese día (según noches por destino) y escapadas de ese día. */
  function lugarDelDia(v, dia) {
    const dests = v.destinos || [];
    const base = dests.find(d => !d.soloDia && d.desde && d.hasta && dia >= d.desde && dia < d.hasta)
      || dests.filter(d => !d.soloDia && d.hasta === dia).slice(-1)[0];
    const escapada = dests.find(d => d.soloDia && d.fecha === dia);
    return [base && base.nombre, escapada && `escapada a ${escapada.nombre}`].filter(Boolean).join(' · ');
  }

  function ordenar(a, b) { return (a.fecha || '').localeCompare(b.fecha || '') || (a.hora || '99').localeCompare(b.hora || '99'); }

  function render(v, cont) {
    const dias = diasDelViaje(v);
    const eventos = v.itinerario.slice().sort(ordenar);
    const hoy = U.hoyISO();
    let bloques = [];

    if (dias.length) {
      bloques = dias.map((d, i) => ({ clave: d, titulo: `Día ${i + 1}${lugarDelDia(v, d) ? ' · ' + lugarDelDia(v, d) : ''}`, sub: U.fmtFecha(d, 'largo'), eventos: eventos.filter(e => e.fecha === d), esHoy: d === hoy }));
      const fuera = eventos.filter(e => !dias.includes(e.fecha));
      if (fuera.length) bloques.push({ clave: '', titulo: 'Fuera de las fechas del viaje', sub: 'Revisá si hay que moverlos', eventos: fuera, fuera: true });
    } else {
      const fechas = Array.from(new Set(eventos.map(e => e.fecha || '')));
      bloques = fechas.map(f => ({ clave: f, titulo: f ? U.fmtFecha(f, 'largo') : 'Sin fecha', sub: '', eventos: eventos.filter(e => (e.fecha || '') === f) }));
    }

    cont.innerHTML = `
      <div class="bloque-cab cab-seccion">
        <div>
          <h2 class="titulo-seccion">Itinerario</h2>
          <p class="texto-suave">${dias.length ? `${U.plural(dias.length, 'día', 'días')} de viaje. Dejá huecos libres: también son parte del plan.` : 'Cuando tengas fechas, te armo los días automáticamente.'}</p>
        </div>
        <button class="btn btn-primario" data-a="nuevo">+ Agregar</button>
      </div>
      ${bloques.length ? `<div class="linea-tiempo">${bloques.map(b => `
        <section class="dia ${b.esHoy ? 'hoy' : ''} ${b.fuera ? 'fuera' : ''}">
          <header class="dia-cab">
            <div><strong>${esc(b.titulo)}</strong>${b.esHoy ? ' <span class="chip chip-sol">Hoy</span>' : ''}<small>${esc(b.sub)}</small></div>
            ${b.clave ? `<button class="btn-icono" data-agregar="${b.clave}" title="Agregar a este día">+</button>` : ''}
          </header>
          ${b.eventos.length ? b.eventos.map(e => `
            <article class="evento" data-evento="${e.id}">
              <span class="ev-hora">${esc(e.hora || '—')}</span>
              <span class="ev-icono">${tipo(e.tipo).icono}</span>
              <div class="ev-texto">
                <strong>${esc(e.titulo)}${e.origen ? ' <span class="chip chip-gris" title="Lo cargó la guía">🧭</span>' : ''}</strong>
                ${e.lugar ? `<small>📍 ${esc(e.lugar)}</small>` : ''}
                ${e.confirmacion ? `<small>Código: ${esc(e.confirmacion)}</small>` : ''}
                ${e.notas ? `<small class="ev-notas">${esc(e.notas)}</small>` : ''}
              </div>
            </article>`).join('') : '<p class="dia-libre">Día libre ☀️</p>'}
        </section>`).join('')}</div>` : `
        <div class="vacio">
          <div class="vacio-icono">🗓️</div>
          <h3>Tu itinerario está en blanco</h3>
          <p>Sumá vuelos, check-ins, excursiones y esa cena que no te querés perder.</p>
          <button class="btn btn-primario" data-a="nuevo2">Agregar el primero</button>
        </div>`}`;

    cont.querySelectorAll('[data-a="nuevo"],[data-a="nuevo2"]').forEach(b => b.onclick = () => editar(v));
    cont.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => editar(v, null, b.dataset.agregar));
    cont.querySelectorAll('[data-evento]').forEach(b => b.onclick = () => editar(v, b.dataset.evento));
  }

  function editar(v, id, fechaSugerida) {
    const existente = id ? v.itinerario.find(e => e.id === id) : null;
    const e = existente || { fecha: fechaSugerida || v.fechaInicio || U.hoyISO(), hora: '', tipo: 'actividad', titulo: '', lugar: '', confirmacion: '', notas: '' };
    const acciones = [{ texto: 'Cancelar' }];
    if (existente) acciones.unshift({
      texto: 'Eliminar', clase: 'btn-texto peligro', onClick: () => {
        v.itinerario = v.itinerario.filter(x => x.id !== id);
        R.db.guardarViaje(v);
        R.app.refrescar();
        U.toast('Eliminado del itinerario.');
      }
    });
    acciones.push({
      texto: 'Guardar', clase: 'btn-primario', onClick: el => {
        const titulo = el.querySelector('#iTitulo').value.trim();
        if (!titulo) { U.toast('Poné un título.'); return false; }
        const nuevo = Object.assign({}, e, {
          id: e.id || U.id('evt'),
          fecha: el.querySelector('#iFecha').value,
          hora: el.querySelector('#iHora').value,
          tipo: el.querySelector('#iTipo').value,
          titulo,
          lugar: el.querySelector('#iLugar').value.trim(),
          confirmacion: el.querySelector('#iConf').value.trim(),
          notas: el.querySelector('#iNotas').value.trim()
        });
        if (existente) v.itinerario = v.itinerario.map(x => x.id === nuevo.id ? nuevo : x);
        else v.itinerario.push(nuevo);
        R.db.guardarViaje(v);
        R.app.refrescar();
        U.toast(existente ? 'Itinerario actualizado.' : 'Agregado al itinerario.');
      }
    });

    U.modal({
      titulo: existente ? 'Editar' : 'Agregar al itinerario',
      cuerpo: `
        ${existente && existente.origen ? `<p class="aviso-suave">🧭 Lo cargó el paso "${esc(R.motor.nombre(v, existente.origen))}". Si volvés a guardar ese paso, este evento se actualiza.</p>` : ''}
        <div class="chips-elegir" id="iTipos">${TIPOS.map(t => `<button type="button" class="chip-op ${e.tipo === t.id ? 'activo' : ''}" data-tipo="${t.id}">${t.icono} ${t.nombre}</button>`).join('')}</div>
        <input type="hidden" id="iTipo" value="${esc(e.tipo)}">
        <label class="campo"><span>Título *</span><input id="iTitulo" value="${esc(e.titulo)}" placeholder="Ej: Vuelo a Bariloche, Check-in hotel, Cerro Catedral"></label>
        <div class="grilla-2">
          <label class="campo"><span>Fecha</span><input type="date" id="iFecha" value="${esc(e.fecha)}"></label>
          <label class="campo"><span>Hora</span><input type="time" id="iHora" value="${esc(e.hora)}"></label>
        </div>
        <div class="grilla-2">
          <label class="campo"><span>Lugar</span><input id="iLugar" value="${esc(e.lugar)}" placeholder="Dirección o referencia"></label>
          <label class="campo"><span>Código de reserva</span><input id="iConf" value="${esc(e.confirmacion)}"></label>
        </div>
        <label class="campo"><span>Notas</span><textarea id="iNotas" rows="2">${esc(e.notas)}</textarea></label>`,
      acciones,
      alAbrir: el => {
        el.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => {
          el.querySelector('#iTipo').value = b.dataset.tipo;
          el.querySelectorAll('[data-tipo]').forEach(x => x.classList.toggle('activo', x === b));
        });
      }
    });
  }

  return { TIPOS, render, editar };
})();
