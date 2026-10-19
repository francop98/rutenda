/* =========================================================
   Tripbox — viajeros y compañeros de viaje
   - Pestaña Viajeros de cada viaje.
   - Pantalla "Compañeros": historial de con quién viajaste.
   ========================================================= */
window.R = window.R || {};

R.participantes = (function () {
  const U = R.util;
  const { esc } = U;

  function viajesCon(personaId) {
    return R.db.viajes().filter(v => v.participantes.includes(personaId))
      .sort((a, b) => (b.fechaInicio || '9').localeCompare(a.fechaInicio || '9'));
  }

  /* ---------- Pestaña Viajeros ---------- */
  function renderViajeros(v, cont) {
    const saldos = R.gastos.saldos(v);
    const disponibles = R.db.personas().filter(p => !v.participantes.includes(p.id));

    cont.innerHTML = `
      <div class="bloque-cab cab-seccion">
        <div>
          <h2 class="titulo-seccion">Viajeros</h2>
          <p class="texto-suave">${U.plural(v.participantes.length, 'persona', 'personas')} en este viaje.</p>
        </div>
      </div>
      <div class="grilla-viajeros">${v.participantes.map(id => {
        const p = R.db.persona(id);
        if (!p) return '';
        const otros = viajesCon(id).filter(x => x.id !== v.id).length;
        const s = saldos[id] || 0;
        return `<div class="viajero">
          ${U.avatar(p, 52)}
          <div class="viajero-info">
            <strong>${esc(p.nombre)}${p.esYo ? ' <span class="chip chip-gris">Vos</span>' : ''}</strong>
            <small>${p.esYo ? 'Organizador/a' : otros ? `Ya viajaron juntos ${U.plural(otros, 'vez', 'veces')} más` : 'Primer viaje juntos'}</small>
            ${v.participantes.length > 1 && v.movimientos.length ? `<small class="${s > 0.009 ? 'positivo' : s < -0.009 ? 'negativo' : ''}">${s > 0.009 ? 'Le deben ' + U.fmtMoneda(s, v.monedaBase) : s < -0.009 ? 'Debe ' + U.fmtMoneda(-s, v.monedaBase) : 'A mano'}</small>` : ''}
          </div>
          ${!p.esYo ? `<button class="btn-icono" data-quitar="${p.id}" title="Quitar del viaje">×</button>` : ''}
        </div>`;
      }).join('')}</div>

      <div class="bloque">
        <h3 class="bloque-titulo">Sumar viajeros</h3>
        ${disponibles.length ? `
          <p class="texto-suave">Tus compañeros de otros viajes:</p>
          <div class="chips-personas">${disponibles.map(p => `<button class="chip-persona" data-sumar="${p.id}">${U.avatar(p, 24)} ${esc(p.nombre)} <span>+</span></button>`).join('')}</div>` : ''}
        <div class="fila-agregar">
          <input id="vNuevo" placeholder="Nombre de alguien nuevo">
          <button class="btn btn-primario" data-a="nuevo">Agregar</button>
        </div>
      </div>`;

    cont.querySelectorAll('[data-sumar]').forEach(b => b.onclick = () => sumar(v, b.dataset.sumar));
    cont.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => quitar(v, b.dataset.quitar));
    const input = cont.querySelector('#vNuevo');
    const nuevo = () => {
      const nombre = input.value.trim();
      if (!nombre) { U.toast('Escribí un nombre.'); return; }
      const existente = R.db.personas().find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
      sumar(v, existente ? existente.id : R.db.crearPersona(nombre).id);
    };
    cont.querySelector('[data-a="nuevo"]').onclick = nuevo;
    input.onkeydown = e => { if (e.key === 'Enter') nuevo(); };
  }

  function sumar(v, id) {
    if (v.participantes.includes(id)) { U.toast('Ya está en este viaje.'); return; }
    v.participantes.push(id);
    avisarCambioParticipantes(v);
    R.db.guardarViaje(v);
    R.app.refrescar();
    U.toast(`${R.db.persona(id).nombre} se sumó al viaje.`);
  }

  async function quitar(v, id) {
    const p = R.db.persona(id);
    if (R.gastos.personaTieneMovimientos(v, id)) {
      U.toast(`${p.nombre} tiene gastos cargados en este viaje. Primero editá o eliminá esos movimientos.`);
      return;
    }
    const ok = await U.confirmar(`¿Quitar a ${p.nombre} de este viaje? Sigue guardado como compañero.`, { textoSi: 'Quitar' });
    if (!ok) return;
    v.participantes = v.participantes.filter(x => x !== id);
    avisarCambioParticipantes(v);
    R.db.guardarViaje(v);
    R.app.refrescar();
  }

  /** Si el transporte ya estaba resuelto, cambiar viajeros puede afectar pasajes y alojamiento. */
  function avisarCambioParticipantes(v) {
    const afecta = ['t_principal', 'a_reserva'].some(base => R.motor.idsDe(v, base).some(id => R.motor.estado(v, id) === 'hecha'));
    if (!afecta) return;
    setTimeout(() => {
      U.confirmar('Cambiaste los viajeros y ya tenías pasajes o alojamiento resueltos. ¿Querés que te arme un plan para revisar lo afectado?', {
        titulo: 'Esto puede afectar otras reservas', textoSi: 'Sí, revisar', textoNo: 'No hace falta'
      }).then(ok => {
        if (!ok) return;
        R.motor.replanificar(v, ['participantes'], 'Cambio de viajeros');
        R.motor.setEstado(v, 'd_participantes', 'hecha');
        R.db.guardarViaje(v);
        R.app.refrescar();
        R.vistaGuia.mostrarPlan(v, R.motor.ordenarPlan(v, R.motor.pasosARevisar(v)));
      });
    }, 300);
  }

  /* ---------- Pantalla Compañeros ---------- */
  function renderPersonas(app) {
    const yo = R.db.yo();
    const personas = R.db.personas();
    const misViajes = viajesCon(yo.id);
    const realizados = misViajes.filter(v => R.viajes.estadoViaje(v) === 'pasado');
    const diasViajados = realizados.reduce((a, v) => a + (v.fechaInicio && v.fechaFin ? U.diasEntre(v.fechaInicio, v.fechaFin) + 1 : 0), 0);
    const destinos = new Set(misViajes.map(v => (v.destino || '').toLowerCase())).size;
    const otros = personas.filter(p => !p.esYo).map(p => ({ p, viajes: viajesCon(p.id) }))
      .sort((a, b) => b.viajes.length - a.viajes.length || a.p.nombre.localeCompare(b.p.nombre));

    app.innerHTML = `
      <section class="encabezado-simple">
        <h1>Compañeros de viaje</h1>
        <p class="texto-suave">Con quién compartiste cada aventura.</p>
      </section>

      <div class="tarjeta-yo">
        ${U.avatar(yo, 64)}
        <div class="ty-info">
          <h2>${esc(yo.nombre === 'Yo' ? 'Vos' : yo.nombre)}</h2>
          <button class="btn btn-texto btn-chico" data-editar="${yo.id}">Cambiar nombre</button>
        </div>
        <div class="ty-datos">
          <div><strong>${misViajes.length}</strong><small>viajes</small></div>
          <div><strong>${realizados.length}</strong><small>realizados</small></div>
          <div><strong>${destinos}</strong><small>destinos</small></div>
          <div><strong>${diasViajados}</strong><small>días viajados</small></div>
        </div>
      </div>

      ${otros.length ? `<div class="grilla-companeros">${otros.map(({ p, viajes }) => `
        <article class="companero">
          <div class="comp-cab">
            ${U.avatar(p, 46)}
            <div>
              <strong>${esc(p.nombre)}</strong>
              <small>${viajes.length ? U.plural(viajes.length, 'viaje juntos', 'viajes juntos') : 'Todavía sin viajes'}</small>
            </div>
            <div class="comp-acciones">
              <button class="btn-icono" data-editar="${p.id}" title="Editar">✎</button>
              ${!viajes.length ? `<button class="btn-icono" data-borrar="${p.id}" title="Eliminar">🗑</button>` : ''}
            </div>
          </div>
          ${viajes.length ? `<ul class="comp-viajes">${viajes.map(v => `
            <li><a href="#viaje/${v.id}/guia"><span class="punto" style="background:${U.portada(v.destino)}"></span>${esc(v.nombre || v.destino)}<small>${esc(v.fechaInicio ? U.fmtFecha(v.fechaInicio) : 'Sin fecha')}</small></a></li>`).join('')}</ul>` : ''}
        </article>`).join('')}</div>` : `
        <div class="vacio">
          <div class="vacio-icono">👥</div>
          <h3>Todavía no sumaste compañeros</h3>
          <p>Cuando agregues viajeros a tus viajes, acá vas a ver el historial de con quién viajaste.</p>
        </div>`}`;

    app.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editarPersona(b.dataset.editar));
    app.querySelectorAll('[data-borrar]').forEach(b => b.onclick = async () => {
      const p = R.db.persona(b.dataset.borrar);
      const ok = await U.confirmar(`¿Eliminar a ${p.nombre} de tus compañeros?`, { textoSi: 'Eliminar', peligro: true });
      if (!ok) return;
      R.db.eliminarPersona(p.id);
      R.app.refrescar();
    });
  }

  function editarPersona(id) {
    const p = R.db.persona(id);
    if (!p) return;
    U.modal({
      titulo: p.esYo ? 'Tu nombre' : 'Editar compañero',
      cuerpo: `<label class="campo"><span>Nombre</span><input id="pNombre" value="${esc(p.esYo && p.nombre === 'Yo' ? '' : p.nombre)}" placeholder="Nombre"></label>`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar', clase: 'btn-primario', onClick: el => {
            const n = el.querySelector('#pNombre').value.trim();
            if (!n) { U.toast('Escribí un nombre.'); return false; }
            p.nombre = n;
            R.db.guardarPersona(p);
            R.app.refrescar();
          }
        }
      ]
    });
  }

  return { renderViajeros, renderPersonas, viajesCon };
})();
