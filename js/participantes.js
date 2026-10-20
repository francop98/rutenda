/* =========================================================
   Tripbox — viajeros, viajes compartidos y compañeros
   - Pestaña Viajeros: quiénes viajan, invitar con un enlace,
     roles (organizador, coorganizador, viajero).
   - Pantalla para sumarse a un viaje (#unirse/{codigo}).
   - Pantalla "Compañeros": historial de con quién viajaste.
   ========================================================= */
window.R = window.R || {};

R.participantes = (function () {
  const U = R.util;
  const { esc } = U;
  const ROLES = { organizador: 'Organizador', coorganizador: 'Coorganizador', viajero: 'Viajero' };

  function viajesCon(personaId) {
    return R.db.viajes().filter(v => (v.participantes || []).includes(personaId))
      .sort((a, b) => (b.fechaInicio || '9').localeCompare(a.fechaInicio || '9'));
  }
  function enlace(codigo) { return `${location.origin}${location.pathname}#unirse/${codigo}`; }

  /* ---------- Pestaña Viajeros ---------- */
  function renderViajeros(v, cont) {
    const saldos = R.gastos.saldos(v);
    const disponibles = R.db.personas().filter(p => !p.esYo && !v.participantes.includes(p.id));
    const nube = R.db.modo() === 'nube';
    const organiza = R.db.puedeOrganizar(v);
    const invitacion = v.invitacion && v.invitacion.activa ? v.invitacion : null;
    const miRol = R.db.rol(v);

    cont.innerHTML = `
      <div class="bloque-cab cab-seccion">
        <div>
          <h2 class="titulo-seccion">Viajeros</h2>
          <p class="texto-suave">${U.plural(v.participantes.length, 'persona', 'personas')} en este viaje${nube ? ` · tu rol: <strong>${ROLES[miRol]}</strong>` : ''}.</p>
        </div>
      </div>
      <div class="grilla-viajeros">${v.participantes.map(id => {
        const p = R.db.persona(id);
        if (!p) return '';
        const otros = viajesCon(id).filter(x => x.id !== v.id).length;
        const s = saldos[id] || 0;
        const rol = p.uid && v.roles ? v.roles[p.uid] : null;
        const puedeCambiarRol = nube && organiza && p.uid && !p.esYo && p.uid !== v.owner && rol;
        return `<div class="viajero">
          ${U.avatar(p, 52)}
          <div class="viajero-info">
            <strong>${esc(p.nombre)}${p.esYo ? ' <span class="chip chip-gris">Vos</span>' : ''}</strong>
            <small>${nube ? (rol ? ROLES[rol] + (p.uid === v.owner ? ' · creó el viaje' : '') : '<span class="sin-cuenta">Todavía no se sumó con su cuenta</span>') : (otros ? `Ya viajaron juntos ${U.plural(otros, 'vez', 'veces')} más` : 'Primer viaje juntos')}</small>
            ${v.participantes.length > 1 && v.movimientos.length ? `<small class="${s > 0.009 ? 'positivo' : s < -0.009 ? 'negativo' : ''}">${s > 0.009 ? 'Le deben ' + U.fmtMoneda(s, v.monedaBase) : s < -0.009 ? 'Debe ' + U.fmtMoneda(-s, v.monedaBase) : 'A mano'}</small>` : ''}
            ${puedeCambiarRol ? `<select class="select-rol" data-rol="${p.uid}"><option value="viajero" ${rol === 'viajero' ? 'selected' : ''}>Viajero</option><option value="coorganizador" ${rol === 'coorganizador' ? 'selected' : ''}>Coorganizador</option></select>` : ''}
          </div>
          ${!p.esYo && organiza && p.uid !== v.owner ? `<button class="btn-icono" data-quitar="${p.id}" title="Quitar del viaje">×</button>` : ''}
        </div>`;
      }).join('')}</div>

      ${nube && organiza ? `
        <div class="bloque bloque-invitar">
          <h3 class="bloque-titulo">🔗 Compartir el viaje</h3>
          <p class="texto-suave">Mandá el enlace a quienes viajan con vos. Al entrar con su cuenta eligen quiénes son y quedan vinculados.
            Los <strong>viajeros</strong> ven todo, cargan sus gastos y documentos y tildan su valija; los <strong>coorganizadores</strong> además editan la organización.</p>
          ${invitacion ? `
            <div class="enlace-invitacion"><code>${esc(enlace(invitacion.codigo))}</code></div>
            <div class="acciones-fila">
              <button class="btn btn-primario" data-a="compartirEnlace">↗ Enviar enlace</button>
              <button class="btn btn-suave" data-a="copiarEnlace">📋 Copiar</button>
              <button class="btn btn-texto peligro" data-a="desactivar">Desactivar enlace</button>
            </div>` : `<button class="btn btn-primario" data-a="invitar">Crear enlace para invitar</button>`}
        </div>` : ''}
      ${!nube ? '<p class="ayuda">Para compartir el viaje con tus compañeros, Tripbox tiene que estar conectado a tu cuenta en la nube.</p>' : ''}

      ${organiza ? `
        <div class="bloque">
          <h3 class="bloque-titulo">Sumar viajeros</h3>
          ${disponibles.length ? `
            <p class="texto-suave">Tus compañeros de otros viajes:</p>
            <div class="chips-personas">${disponibles.map(p => `<button class="chip-persona" data-sumar="${p.id}">${U.avatar(p, 24)} ${esc(p.nombre)} <span>+</span></button>`).join('')}</div>` : ''}
          <div class="fila-agregar">
            <input id="vNuevo" placeholder="Nombre de alguien nuevo">
            <button class="btn btn-primario" data-a="nuevo">Agregar</button>
          </div>
        </div>` : ''}
      ${nube && !R.db.esDueno(v) ? `<p class="ayuda"><button class="btn btn-texto peligro btn-chico" data-a="salir">Salir de este viaje</button></p>` : ''}`;

    cont.querySelectorAll('[data-sumar]').forEach(b => b.onclick = () => sumar(v, b.dataset.sumar));
    cont.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => quitar(v, b.dataset.quitar));
    const input = cont.querySelector('#vNuevo');
    if (input) {
      const nuevo = () => {
        const nombre = input.value.trim();
        if (!nombre) { U.toast('Escribí un nombre.'); return; }
        const existente = R.db.personas().find(p => !p.esYo && p.nombre.toLowerCase() === nombre.toLowerCase());
        sumar(v, existente ? existente.id : R.db.crearPersona(nombre).id);
      };
      cont.querySelector('[data-a="nuevo"]').onclick = nuevo;
      input.onkeydown = e => { if (e.key === 'Enter') nuevo(); };
    }
    cont.querySelectorAll('[data-rol]').forEach(x => x.onchange = () => {
      R.nube.cambiarRol(v, x.dataset.rol, x.value).then(() => U.toast('Rol actualizado.')).catch(() => U.toast('No se pudo cambiar el rol.'));
    });
    const a = sel => cont.querySelector(`[data-a="${sel}"]`);
    if (a('invitar')) a('invitar').onclick = async () => {
      a('invitar').disabled = true;
      try { await R.nube.crearInvitacion(v); R.app.refrescar(); compartirEnlace(v); } catch (e) { console.error(e); U.toast('No se pudo crear el enlace. Revisá la conexión.'); a('invitar').disabled = false; }
    };
    if (a('compartirEnlace')) a('compartirEnlace').onclick = () => compartirEnlace(v);
    if (a('copiarEnlace')) a('copiarEnlace').onclick = () => navigator.clipboard.writeText(enlace(v.invitacion.codigo)).then(() => U.toast('Enlace copiado.')).catch(() => U.toast('No se pudo copiar.'));
    if (a('desactivar')) a('desactivar').onclick = async () => {
      if (!await U.confirmar('Quien tenga el enlace ya no va a poder sumarse. Los que ya están siguen en el viaje.', { titulo: 'Desactivar enlace', textoSi: 'Desactivar' })) return;
      await R.nube.desactivarInvitacion(v); R.app.refrescar();
    };
    if (a('salir')) a('salir').onclick = async () => {
      if (!await U.confirmar('Vas a dejar de ver este viaje. Tus gastos cargados quedan para el resto.', { titulo: 'Salir del viaje', textoSi: 'Salir', peligro: true })) return;
      await R.db.eliminarViaje(v.id);
      location.hash = '#inicio';
    };
  }

  function compartirEnlace(v) {
    const url = enlace(v.invitacion.codigo);
    const texto = `¡Sumate a "${v.nombre || v.destino}" en Tripbox! Ahí tenemos el cronograma, los gastos y todo lo del viaje: ${url}`;
    if (navigator.share) navigator.share({ title: 'Tripbox', text: texto }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
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
    const ok = await U.confirmar(`¿Quitar a ${p.nombre} de este viaje?${p.uid ? ' También deja de tener acceso.' : ''}`, { textoSi: 'Quitar' });
    if (!ok) return;
    if (p.uid && R.db.modo() === 'nube') { try { await R.nube.quitarMiembro(v, p.uid); } catch (e) { U.toast('No se pudo quitar el acceso.'); return; } }
    v.participantes = v.participantes.filter(x => x !== id);
    delete v.personas[id];
    avisarCambioParticipantes(v);
    R.db.guardarViaje(v);
    R.app.refrescar();
  }

  /** Si el transporte ya estaba resuelto, cambiar viajeros puede afectar pasajes y alojamiento. */
  function avisarCambioParticipantes(v) {
    const afecta = ['t_segmento', 'a_reserva'].some(base => R.motor.idsDe(v, base).some(id => R.motor.estado(v, id) === 'hecha'));
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

  /* ---------- Sumarse a un viaje ---------- */
  async function renderUnirse(app, codigo) {
    document.title = 'Sumarte a un viaje · Tripbox';
    if (R.db.modo() !== 'nube') {
      app.innerHTML = `<div class="vacio"><div class="vacio-icono">🔗</div><h3>Viajes compartidos</h3><p>Para sumarte a un viaje compartido, Tripbox tiene que estar conectado a la nube.</p><a class="btn btn-primario" href="#inicio">Ir al inicio</a></div>`;
      return;
    }
    app.innerHTML = '<div class="pantalla-carga"><span class="marca-logo grande"></span><p>Buscando la invitación…</p></div>';
    let inv = null;
    try { inv = await R.nube.leerInvitacion(codigo); } catch (e) { inv = null; }
    if (!inv || !inv.activa) {
      app.innerHTML = `<div class="vacio"><div class="vacio-icono">🔗</div><h3>El enlace no es válido</h3><p>Puede que lo hayan desactivado. Pedile a quien organiza que te mande uno nuevo.</p><a class="btn btn-primario" href="#inicio">Ir al inicio</a></div>`;
      return;
    }
    if (R.db.viaje(inv.viajeId)) { location.hash = `#viaje/${inv.viajeId}/guia`; return; }
    const libres = (inv.personas || []).filter(p => !p.vinculada);
    const yo = R.db.yo();
    const sugerida = libres.find(p => p.nombre.toLowerCase().split(' ')[0] === yo.nombre.toLowerCase().split(' ')[0]);
    app.innerHTML = `
      <section class="unirse">
        <div class="unirse-portada" style="background:${U.portada(inv.destino || inv.nombre)}">
          ${U.paisaje(null, { transporte: 'avion', progreso: 0.5 })}
          <div><span class="etiqueta-clara">${esc(inv.organizador || 'Alguien')} te invitó</span><h1>${esc(inv.nombre)}</h1><p>${esc(U.fmtRango(inv.fechaInicio, inv.fechaFin))}</p></div>
        </div>
        <div class="bloque">
          <h3 class="bloque-titulo">¿Quién sos en este viaje?</h3>
          <div class="lista-elegir-personas">
            ${libres.map(p => `<label class="persona-op"><input type="radio" name="quien" value="${p.id}" ${sugerida && sugerida.id === p.id ? 'checked' : ''}> ${U.avatar(p, 30)}<span>${esc(p.nombre)}</span></label>`).join('')}
            <label class="persona-op"><input type="radio" name="quien" value="" ${!sugerida && !libres.length ? 'checked' : ''}> ${U.avatar(yo, 30)}<span>No estoy en la lista: sumarme como ${esc(yo.nombre)}</span></label>
          </div>
          <button class="btn btn-primario btn-grande btn-bloque" data-a="unirme">Sumarme al viaje</button>
          <a class="btn btn-texto btn-bloque" href="#inicio">Ahora no</a>
        </div>
      </section>`;
    app.querySelector('[data-a="unirme"]').onclick = async () => {
      const elegido = app.querySelector('input[name="quien"]:checked');
      if (!elegido) { U.toast('Elegí quién sos.'); return; }
      const b = app.querySelector('[data-a="unirme"]');
      b.disabled = true; b.textContent = 'Sumándote…';
      try {
        await R.nube.unirse(inv, elegido.value || null, yo.nombre);
        // Esperar a que llegue el viaje
        for (let i = 0; i < 40 && !R.db.viaje(inv.viajeId); i++) await new Promise(r => setTimeout(r, 200));
        U.toast('¡Listo! Ya estás en el viaje. 🎉');
        location.hash = `#viaje/${inv.viajeId}/guia`;
      } catch (e) {
        console.error(e);
        b.disabled = false; b.textContent = 'Sumarme al viaje';
        U.toast('No se pudo sumar. Puede que el enlace ya no esté activo.');
      }
    };
  }

  /* ---------- Pantalla Compañeros ---------- */
  function renderPersonas(app) {
    const yo = R.db.yo();
    const personas = R.db.personas();
    const misViajes = R.db.viajes().slice();
    const realizados = misViajes.filter(v => R.viajes.estadoViaje(v) === 'pasado');
    const diasViajados = realizados.reduce((a, v) => a + (v.fechaInicio && v.fechaFin ? U.diasEntre(v.fechaInicio, v.fechaFin) + 1 : 0), 0);
    const destinos = new Set(misViajes.flatMap(v => (v.destinos || []).map(d => (d.nombre || '').toLowerCase()))).size;
    const otros = personas.filter(p => !p.esYo).map(p => ({ p, viajes: viajesCon(p.id) })).filter(x => x.viajes.length)
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
          <button class="btn btn-texto btn-chico" data-a="cuenta">Mi cuenta</button>
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
              <small>${U.plural(viajes.length, 'viaje juntos', 'viajes juntos')}${p.uid ? ' · con cuenta en Tripbox' : ''}</small>
            </div>
            <div class="comp-acciones">
              <button class="btn-icono" data-editar="${p.id}" title="Cambiar nombre">✎</button>
            </div>
          </div>
          <ul class="comp-viajes">${viajes.map(v => `
            <li><a href="#viaje/${v.id}/guia"><span class="punto" style="background:${U.portada(v.destino)}"></span>${esc(v.nombre || v.destino)}<small>${esc(v.fechaInicio ? U.fmtFecha(v.fechaInicio) : 'Sin fecha')}</small></a></li>`).join('')}</ul>
        </article>`).join('')}</div>` : `
        <div class="vacio">
          <div class="vacio-icono">👥</div>
          <h3>Todavía no sumaste compañeros</h3>
          <p>Cuando agregues viajeros a tus viajes, acá vas a ver el historial de con quién viajaste.</p>
        </div>`}`;

    app.querySelector('[data-a="cuenta"]').onclick = () => R.auth.abrirMiCuenta();
    app.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editarPersona(b.dataset.editar));
  }

  function editarPersona(id) {
    const p = R.db.persona(id);
    if (!p) return;
    U.modal({
      titulo: 'Cambiar nombre',
      subtitulo: 'Se actualiza en los viajes que organizás.',
      cuerpo: `<label class="campo"><span>Nombre</span><input id="pNombre" value="${esc(p.nombre)}" placeholder="Nombre"></label>`,
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

  return { renderViajeros, renderPersonas, renderUnirse, viajesCon, ROLES };
})();
