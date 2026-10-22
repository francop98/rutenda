/* =========================================================
   Rutenda — pestaña Guía (paso a paso)
   Próximo paso recomendado, lo que sigue, fases, detalle de
   cada paso, pasos propios y "cambio de planes".
   ========================================================= */
window.R = window.R || {};

R.vistaGuia = (function () {
  const U = R.util;
  const { esc } = U;

  const ICONO_RAZON = { impacto: '⭐', urgente: '⏰', tiempo: '🗓️', destraba: '🔓', espera: '↪️', cambio: '🔄', curso: '▶️' };

  function guardar(v) { R.db.guardarViaje(v); }

  function chipFecha(t) {
    if (t.resuelta || t.diasRestantes == null) return '';
    const d = t.diasRestantes;
    if (d < 0) return `<span class="chip chip-alerta">Atrasado ${-d} d</span>`;
    if (d <= 7) return `<span class="chip chip-sol">${d === 0 ? 'Hoy' : `En ${d} d`}</span>`;
    return `<span class="chip">${U.fmtFecha(t.fechaLimite, 'corto')}</span>`;
  }

  const esPaqueteSinDatos = (v, t) => { const x = v.tareas[t.id] || {}; return !!x.incluidoEnPaquete && x.estado === 'en_curso' && !x.datos && t.tieneFormulario; };

  function chipEstado(t) {
    if (t.esperaVentana) return '<span class="chip chip-gris">Más adelante</span>';
    if (t.postergado || t.estado === 'en_curso') return '<span class="chip chip-gris">Pendiente</span>';
    if (t.faltanDatos) return '<span class="chip chip-sol">Faltan datos</span>';
    if (t.estado === 'pendiente') return t.bloqueada ? '<span class="chip chip-gris">Esperando</span>' : '';
    const e = R.guia.ESTADOS[t.estado];
    return `<span class="chip ${e.clase}">${e.nombre}</span>`;
  }

  /* ---------------------------------------------------------
     Render principal
     --------------------------------------------------------- */
  function render(v, cont) {
    const prog = R.motor.progreso(v);
    const proximos = R.motor.proximos(v, 4);
    const fases = R.motor.progresoPorFase(v);
    const aRevisar = R.motor.pasosARevisar(v);
    const top = proximos[0];
    const info = R.motor.analizar(v);
    const faltanDatos = info.filter(t => t.faltanDatos);
    const pendientes = R.motor.pendientes(v);

    const ahora = proximos.slice(0, 3);
    const rec = R.motor.recomendaciones(v);
    const reqHTML = R.requisitos.tarjeta(v);
    const cosHTML = R.costumbres ? R.costumbres.html(v) : '';
    const est = R.viajes.estadoViaje(v);
    const plegable = (id, titulo, cuenta, cuerpo, abierto) => `
      <details class="plegable" data-plegable="${id}" ${abierto || plegado[id] ? 'open' : ''}>
        <summary><span>${titulo}</span>${cuenta != null ? `<span class="contador">${cuenta}</span>` : ''}</summary>
        <div class="plegable-cuerpo">${cuerpo}</div>
      </details>`;

    cont.innerHTML = `
      <div class="guia-simple">
      ${aRevisar.length ? `
        <div class="aviso-cambio">
          <div><strong>🔄 Reorganizando el viaje</strong><p>${U.plural(aRevisar.length, 'paso para revisar', 'pasos para revisar')}.</p></div>
          <button class="btn btn-primario btn-chico" data-a="verPlan">Ver en orden</button>
        </div>` : ''}

      ${R.salida ? R.salida.tarjetaHTML(v) : ''}
      <h3 class="guia-seccion">Ahora</h3>
      ${top ? tarjetaProximo(v, top) : tarjetaSinProximo(v, prog, pendientes.length)}
      ${ahora.length > 1 ? `<div class="lista-siguientes lista-ahora">${ahora.slice(1).map(t => filaPaso(v, t)).join('')}</div>` : ''}

      ${faltanDatos.length ? `
        <div class="bloque bloque-datos">
          <h3 class="bloque-titulo">Completá los datos <span class="contador">${faltanDatos.length}</span></h3>
          <div class="lista-siguientes">${faltanDatos.map(t => `
            <div class="fila-siguiente fila-datos">
              <span class="num">${R.guia.fase(t.fase).icono}</span>
              <span class="fs-texto" data-tarea="${t.id}"><strong>${esc(t.titulo)}</strong><small>${(v.tareas[t.id] || {}).incluidoEnPaquete ? 'Del paquete · ' : ''}Faltan horarios, códigos o costos</small></span>
              <button class="btn btn-primario btn-chico" data-completar="${t.id}">Completar</button>
              <button class="btn btn-texto btn-chico" data-nohace="${t.id}">No hace falta</button>
            </div>`).join('')}</div>
        </div>` : ''}

      ${pendientes.length ? plegable('despues', 'Más adelante', pendientes.length, `
        <div class="lista-siguientes">${pendientes.map(t => `
          <div class="fila-siguiente fila-pendiente">
            <span class="num">${t.esperaVentana ? '⏳' : R.guia.fase(t.fase).icono}</span>
            <span class="fs-texto" data-tarea="${t.id}"><strong>${esc(t.titulo)}</strong><small>${t.esperaVentana ? `Se habilita el ${U.fmtFecha(t.habilitaEl, 'largo')}` : esPaqueteSinDatos(v, t) ? '📦 Del paquete · faltan los datos' : 'Lo dejaste para después'}</small></span>
            <span class="fp-acciones">
              ${t.esperaVentana ? ''
                : esPaqueteSinDatos(v, t) ? `<button class="btn btn-primario btn-chico" data-completar="${t.id}">Completar</button>`
                : `<button class="btn btn-primario btn-chico" data-rapido="hecha" data-id="${t.id}">✓ Listo</button>
                   <button class="btn btn-texto btn-chico" data-reactivar="${t.id}">Retomar</button>`}
            </span>
          </div>`).join('')}</div>`) : ''}

      ${rec.pendientes.length ? plegable('rec', 'Recomendaciones', rec.pendientes.length, recomendacionesHTML(v, rec)) : ''}

      ${reqHTML ? plegable('req', v.perfil.internacional ? 'Documentos y salud para este destino' : 'Salud en este destino', null, reqHTML) : ''}

      ${cosHTML ? plegable('costumbres', '🌎 Cómo es allá', null, cosHTML) : ''}

      ${est !== 'planificando' ? plegable('notas', 'Notas y recuerdos del viaje', null, `<textarea id="notasViaje" rows="3" placeholder="Lo que te gustó, lo que harías distinto…">${esc(v.notasViaje || '')}</textarea>`) : ''}

      ${plegable('todos', 'Todos los pasos', `${prog.hechas}/${prog.total}`, `
        <div class="fases">${fases.map(f => faseHTML(v, f)).join('')}</div>
        <div class="acciones-fila guia-pie">
          <button class="btn btn-suave btn-chico" data-a="propia">+ Paso propio</button>
          <button class="btn btn-suave btn-chico" data-a="cambio">🔄 Cambiaron los planes</button>
        </div>`)}
      </div>`;

    if (R.salida) R.salida.enlazar(cont, v);
    if (R.costumbres) R.costumbres.enlazar(cont, v);
    cont.querySelectorAll('details[data-plegable]').forEach(d => d.addEventListener('toggle', () => { plegado[d.dataset.plegable] = d.open; }));
    cont.querySelectorAll('[data-tarea]').forEach(x => x.addEventListener('click', e => {
      // Los botones de adentro (Listo, Más tarde, etc.) no abren el detalle
      const boton = e.target.closest('button');
      if (boton && boton !== x) return;
      abrirTarea(v, x.dataset.tarea);
    }));
    cont.querySelectorAll('[data-rapido]').forEach(x => x.addEventListener('click', e => {
      e.stopPropagation();
      cambiarEstado(v, x.dataset.id, x.dataset.rapido);
    }));
    const btnCambio = cont.querySelector('[data-a="cambio"]');
    if (btnCambio) btnCambio.onclick = () => cambioDePlanes(v);
    const btnPlan = cont.querySelector('[data-a="verPlan"]');
    if (btnPlan) btnPlan.onclick = () => mostrarPlan(v, R.motor.ordenarPlan(v, R.motor.pasosARevisar(v)));
    cont.querySelectorAll('[data-a="propia"]').forEach(b => b.onclick = () => editarPropia(v));
    cont.querySelectorAll('[data-posponer]').forEach(b => b.onclick = () => {
      R.motor.posponer(v, b.dataset.posponer, true);
      guardar(v);
      R.app.refrescar();
      U.toast('Quedó en "Más adelante".');
    });
    cont.querySelectorAll('[data-reactivar]').forEach(b => b.onclick = () => {
      R.motor.posponer(v, b.dataset.reactivar, false);
      if (R.motor.estado(v, b.dataset.reactivar) === 'en_curso') R.motor.setEstado(v, b.dataset.reactivar, 'pendiente');
      guardar(v);
      R.app.refrescar();
      U.toast('Listo, volvió a "Ahora".');
    });
    const bValija = cont.querySelector('[data-a="abrirValija"]');
    if (bValija) bValija.onclick = () => { location.hash = `#viaje/${v.id}/valija`; };
    cont.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { location.hash = `#viaje/${v.id}/${b.dataset.ir}`; });
    const verRec = cont.querySelector('[data-a="verTodasRec"]');
    if (verRec) verRec.onclick = () => { verTodasRec = !verTodasRec; R.app.refrescar(); };
    const notas = cont.querySelector('#notasViaje');
    if (notas) notas.oninput = () => { v.notasViaje = notas.value; guardar(v); };
    cont.querySelectorAll('[data-completar]').forEach(b => b.onclick = () => R.formularios.abrir(v, b.dataset.completar));
    cont.querySelectorAll('[data-nohace]').forEach(b => b.onclick = () => {
      v.tareas[b.dataset.nohace] = Object.assign({}, v.tareas[b.dataset.nohace], { sinDatosOk: true });
      guardar(v);
      R.app.refrescar();
    });
  }

  /** Recomendaciones: útiles pero no obligatorias, de la más necesaria a la menos. No cuentan en el progreso. */
  function recomendacionesHTML(v, rec) {
    const motivo = t => {
      if (t.bloqueada) return `Cuando tengas: ${t.bloqueadaPor.map(id => R.motor.nombre(v, id)).join(', ')}`;
      return t.porque || '';
    };
    return `
      <ul class="lista-consejos lista-rec">${rec.pendientes.map(t => `
        <li class="${t.bloqueada ? 'rec-espera' : ''} ${t.diasRestantes != null && t.diasRestantes <= 7 && !t.bloqueada ? 'rec-urgente' : ''}">
          <span>${R.guia.fase(t.fase).icono}</span>
          <div data-tarea="${t.id}" class="rec-texto"><strong>${esc(t.titulo)}</strong><small>${esc(motivo(t))}</small></div>
          <div class="rec-acciones">
            ${t.base === 's_valija' ? '<button class="btn btn-suave btn-chico" data-ir="valija">🧳 Armar</button>' : ''}
            <button class="btn-icono rec-ok" data-rapido="hecha" data-id="${t.id}" title="Hecho">✓</button>
            <button class="btn-icono" data-rapido="no_aplica" data-id="${t.id}" title="No me sirve">×</button>
          </div>
        </li>`).join('')}</ul>
      <p class="ayuda">✓ si ya lo hiciste · × si no te sirve.</p>`;
  }

  function mensajeProgreso(pct) {
    if (pct >= 100) return 'Todo listo. Solo queda disfrutar.';
    if (pct >= 75) return 'Ya casi. Quedan los últimos detalles.';
    if (pct >= 40) return 'Buen ritmo: lo grueso ya está encaminado.';
    if (pct > 0) return 'Arrancaste bien. Un paso a la vez.';
    return 'Empecemos por el primer paso.';
  }

  const plegado = {};
  /** Fila de un paso: título, para cuándo y un botón. */
  function filaPaso(v, t) {
    return `
      <div class="fila-siguiente fila-ahora">
        <span class="num">${R.guia.fase(t.fase).icono}</span>
        <span class="fs-texto" data-tarea="${t.id}"><strong>${esc(t.titulo)}</strong>${t.fechaLimite ? `<small>${t.diasRestantes < 0 ? 'Atrasado' : 'Ideal antes del ' + U.fmtFecha(t.fechaLimite, 'corto')}</small>` : ''}</span>
        <button class="btn btn-suave btn-chico" data-rapido="hecha" data-id="${t.id}">${t.abreCronograma ? 'Cargar' : t.tieneFormulario ? 'Cargar' : '✓'}</button>
      </div>`;
  }

  function tarjetaProximo(v, t) {
    const f = R.guia.fase(t.fase);
    return `
      <article class="proximo-paso" data-tarea="${t.id}">
        <div class="pp-cuerpo">
          <span class="pp-icono">${f.icono}</span>
          <div>
            <h2>${esc(t.titulo)}</h2>
            <p>${esc(t.desc)}</p>
            <div class="pp-chips">${chipEstado(t)} ${chipFecha(t)}</div>
          </div>
        </div>
        <div class="pp-acciones">
          <button class="btn btn-primario" data-rapido="hecha" data-id="${t.id}">${t.abreCronograma ? '📅 Cargar las fechas' : t.tieneFormulario ? '✓ Listo, cargar datos' : '✓ Listo'}</button>
          ${t.base === 's_valija' ? '<button class="btn btn-suave" data-a="abrirValija">🧳 Armar valija</button>' : ''}
          <button class="btn btn-texto" data-posponer="${t.id}">Más tarde</button>
          <button class="btn btn-texto" data-rapido="no_aplica" data-id="${t.id}">No aplica</button>
        </div>
        <p class="pp-viajero">Esto lo resuelve quien organiza. Vos podés cargar gastos, documentos y tu valija.</p>
      </article>`;
  }

  function tarjetaSinProximo(v, prog, enEspera) {
    if (enEspera && prog.pct < 100) {
      return `<article class="proximo-paso">
        <div class="pp-cuerpo"><span class="pp-icono">📋</span>
        <div><h2>Solo queda lo de más adelante</h2><p>Todo lo demás está resuelto.</p></div></div>
      </article>`;
    }
    if (prog.pct >= 100) {
      return `<article class="proximo-paso celebracion">
        <div class="pp-cuerpo"><span class="pp-icono">🌅</span>
        <div><h2>¡Todo organizado!</h2><p>No queda nada pendiente. Respirá hondo: ahora toca disfrutar el viaje.</p></div></div>
      </article>`;
    }
    return `<article class="proximo-paso">
      <div class="pp-cuerpo"><span class="pp-icono">⏳</span>
      <div><h2>Por ahora, nada más</h2><p>Lo que queda depende de otros pasos.</p></div></div>
    </article>`;
  }

  function faseHTML(v, f) {
    const completa = f.total > 0 && f.hechas === f.total;
    const pendientes = f.tareas.filter(t => !t.resuelta).length;
    const ordenadas = f.tareas.slice().sort((a, b) => (a.resuelta - b.resuelta) || (b.orden - a.orden));
    return `
      <details class="fase ${completa ? 'completa' : ''}" data-plegable="fase_${f.fase.id}" ${plegado['fase_' + f.fase.id] ? 'open' : ''}>
        <summary>
          <span class="fase-icono">${f.fase.icono}</span>
          <span class="fase-nombre"><strong>${esc(f.fase.nombre)}</strong><small>${esc(f.fase.desc || '')}</small></span>
          <span class="fase-cuenta">${completa ? '✓ Completa' : `${f.hechas}/${f.total}`}</span>
        </summary>
        <div class="fase-tareas">${ordenadas.map(t => `
          <div class="tarea ${t.resuelta ? 'resuelta' : ''} ${t.bloqueada && !t.resuelta ? 'bloqueada' : ''}" data-tarea="${t.id}">
            <button class="tilde ${t.estado === 'hecha' ? 'marcada' : ''} ${t.estado === 'no_aplica' ? 'noaplica' : ''}" data-rapido="${t.estado === 'hecha' || t.estado === 'no_aplica' ? 'pendiente' : 'hecha'}" data-id="${t.id}" aria-label="Marcar ${esc(t.titulo)}">${t.estado === 'hecha' ? '✓' : t.estado === 'no_aplica' ? '–' : ''}</button>
            <div class="tarea-texto">
              <span class="tarea-titulo">${esc(t.titulo)}${t.propia ? ' <span class="chip chip-gris">Propio</span>' : ''}</span>
              ${t.bloqueada && !t.resuelta ? `<small>Espera a: ${esc(t.bloqueadaPor.map(id => R.motor.nombre(v, id)).join(', '))}</small>` : ''}
            </div>
            <div class="tarea-chips">${chipEstado(t)} ${chipFecha(t)}</div>
          </div>`).join('')}</div>
      </details>`;
  }

  /* ---------------------------------------------------------
     Cambios de estado
     --------------------------------------------------------- */
  /** Cambia el estado; "Listo" en un paso con formulario abre la carga de datos. */
  function cambiarEstado(v, id, nuevo) {
    if (nuevo === 'hecha' && id === 'd_fechas') { R.itinerario.editarCronograma(v); return; }
    if (nuevo === 'hecha') {
      // Lo que tiene ventana (como el check-in) no se puede dar por hecho antes de tiempo
      const info = R.motor.analizar(v).find(x => x.id === id);
      if (info && info.esperaVentana) {
        U.toast(`Todavía no se puede: se habilita el ${U.fmtFecha(info.habilitaEl, 'largo')}. Ese día te aviso.`);
        return;
      }
    }
    if (nuevo === 'hecha' && R.motor.estado(v, id) !== 'hecha') {
      const t = R.motor.lista(v).find(x => x.id === id);
      if (t && R.formularios.tiene(t) && R.formularios.abrir(v, id)) return;
    }
    const progAntes = R.motor.progreso(v).pct;
    const destrabadas = R.motor.setEstado(v, id, nuevo);
    guardar(v);
    R.app.refrescar();
    const progDespues = R.motor.progreso(v).pct;
    const deducidas = nuevo === 'hecha' ? R.motor.deducidasRecientes() : [];
    if (deducidas.length) {
      U.toast(`Listo. También di por resuelto: ${deducidas.map(t => t.titulo).slice(0, 3).join(', ')}${deducidas.length > 3 ? '…' : ''}.`);
      return;
    }

    if (progDespues === 100 && progAntes < 100) {
      celebrar();
    } else if (nuevo === 'hecha' && destrabadas.length) {
      U.toast(`¡Bien! Se destrabó: ${destrabadas.map(t => t.titulo).slice(0, 2).join(', ')}${destrabadas.length > 2 ? '…' : ''}`);
    } else if (nuevo === 'hecha') {
      U.toast('¡Un paso menos! ✓');
    } else if (nuevo === 'no_aplica') {
      U.toast('Listo, lo saqué del recorrido.');
    }
  }

  function celebrar() {
    U.modal({
      titulo: '¡Viaje 100% organizado!',
      cuerpo: `<div class="celebrar"><div class="celebrar-sol">🌅</div><p>Hiciste todo lo que había que hacer. Ahora sí: valija, buena música y a disfrutar.</p></div>`,
      acciones: [{ texto: '¡Gracias!', clase: 'btn-primario' }]
    });
  }

  /* ---------------------------------------------------------
     Detalle de un paso
     --------------------------------------------------------- */
  function abrirTarea(v, id) {
    const t = R.motor.analizar(v).find(x => x.id === id);
    if (!t) return;
    const f = R.guia.fase(t.fase);
    const datos = v.tareas[id] || {};
    const docs = v.documentos.filter(d => d.tareaId === id);

    const { el } = U.modal({
      titulo: t.titulo,
      subtitulo: `${f.icono} ${f.nombre}`,
      ancho: true,
      cuerpo: `
        <div class="segmentado segmentado-estado">${Object.entries(R.guia.ESTADOS).filter(([k]) => (k !== 'revisar' || t.estado === 'revisar') && (k !== 'en_curso' || t.estado === 'en_curso')).map(([k, e]) =>
          `<button type="button" data-estado="${k}" class="${t.estado === k ? 'activo' : ''}" ${k === 'hecha' && t.esperaVentana ? 'disabled title="Todavía no se puede hacer"' : ''}>${e.nombre}</button>`).join('')}</div>
        ${datos.incluidoEnPaquete ? '<p class="aviso-suave">📦 Incluido en el paquete que compraste.</p>' : ''}
        ${datos.deducido && t.estado === 'hecha' ? '<p class="aviso-suave">✓ Lo di por resuelto porque completaste un paso que lo necesitaba.</p>' : ''}
        ${t.esperaVentana ? `<p class="aviso-suave">⏳ Se habilita el ${U.fmtFecha(t.habilitaEl, 'largo')}. Hasta entonces queda en tus pendientes.</p>`
          : t.postergado ? '<p class="aviso-suave">📋 Está en tus pendientes. <button type="button" class="btn-texto-mini" data-a="reactivar">Volver a la guía</button></p>' : ''}
        ${t.desc ? `<p class="detalle-desc">${esc(t.desc)}</p>` : ''}
        ${t.enlaces && t.enlaces.length ? `<div class="detalle-enlaces"><h4>Dónde hacerlo</h4>${t.enlaces.map(e => `<a class="enlace-oficial" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer"><span>🔗</span>${esc(e.texto)}<small>${esc(new URL(e.url).hostname.replace(/^www\./, ''))}</small></a>`).join('')}</div>` : ''}
        ${t.tieneFormulario && !t.esperaVentana ? `
          <div class="detalle-datos">
            <div class="bloque-cab"><h4>Datos cargados</h4><button type="button" class="btn ${datos.datos ? 'btn-suave' : 'btn-primario'} btn-chico" data-a="formulario">${datos.datos ? 'Editar datos' : (t.estado === 'hecha' ? 'Cargar datos' : 'Listo, cargar datos')}</button></div>
            ${datos.datos ? `<ul class="lista-resumen">${R.formularios.resumen(v, t).map(l => `<li>${esc(l)}</li>`).join('') || '<li>Sin detalles.</li>'}</ul>` : '<p class="texto-suave">Lo que cargues se suma solo al itinerario, a los gastos y a documentos.</p>'}
          </div>` : ''}
        ${['d_destino', 'd_fechas', 'd_participantes'].includes(t.id) ? '<button type="button" class="btn btn-suave btn-chico boton-editar-viaje" data-a="editarViaje">✎ Editar destinos, fechas y viajeros</button>' : ''}
        ${t.base === 's_valija' ? '<button type="button" class="btn btn-primario btn-chico boton-editar-viaje" data-a="abrirValija">🧳 Abrir el armador de valija</button>' : ''}
        ${['e_imperdibles', 'e_excursiones'].includes(t.base) ? '<button type="button" class="btn btn-primario btn-chico boton-editar-viaje" data-a="verIdeas">📝 Abrir mi lista de qué hacer</button>' : ''}
        ${['doc_pasaporte', 'doc_visa', 'doc_requisitos', 'p_vacunas'].includes(t.base) ? R.requisitos.tarjeta(v) : ''}
        ${t.consejo ? `<div class="consejo"><strong>💡 Consejo</strong><p>${esc(t.consejo)}</p></div>` : ''}
        <label class="campo"><span>Notas</span><textarea id="tNota" rows="2" placeholder="Ej: a quién llamar, opciones que viste…">${esc(datos.nota || '')}</textarea></label>
        <div class="detalle-bloque">
          <div class="bloque-cab"><h4>Archivos</h4><button type="button" class="btn btn-suave btn-chico" data-a="adjuntar">+ Adjuntar</button></div>
          ${docs.length ? `<div class="docs-mini">${docs.map(d => `<button type="button" class="doc-mini" data-doc="${d.id}">${R.documentos.iconoDoc(d)} ${esc(d.nombre)}</button>`).join('')}</div>` : ''}
        </div>
        <details class="plegable plegable-chico"><summary><span>¿Por qué y para cuándo?</span></summary><div class="plegable-cuerpo">
        ${t.razones.length ? `<ul class="lista-razones">${t.razones.map(r => `<li><span>${ICONO_RAZON[r.tipo] || '•'}</span>${esc(r.texto)}</li>`).join('')}</ul>` : ''}
        <div class="detalle-grilla">
          ${t.fechaLimite ? `<div><small>Fecha recomendada</small><strong>${U.fmtFecha(t.fechaLimite, 'largo')}</strong></div>` : ''}
          ${t.dependeDe.length ? `<div><small>Necesita antes</small>${t.dependeDe.map(d => `<span class="dep ${R.motor.resuelta(v, d) ? 'ok' : ''}">${R.motor.resuelta(v, d) ? '✓' : '○'} ${esc(R.motor.nombre(v, d))}</span>`).join('')}</div>` : ''}
          ${t.destraba.length ? `<div><small>Destraba</small>${t.destraba.map(d => `<span class="dep">🔓 ${esc(R.motor.nombre(v, d))}</span>`).join('')}</div>` : ''}
        </div></div></details>
        ${t.propia ? `<div class="detalle-pie-propia"><button type="button" class="btn btn-texto" data-a="editarPropia">Editar paso</button><button type="button" class="btn btn-texto peligro" data-a="borrarPropia">Eliminar paso</button></div>` : ''}`
    });

    const bForm = el.querySelector('[data-a="formulario"]');
    if (bForm) bForm.onclick = () => R.formularios.abrir(v, id);
    const bReact = el.querySelector('[data-a="reactivar"]');
    if (bReact) bReact.onclick = () => { R.motor.posponer(v, id, false); guardar(v); U.cerrarModal(); R.app.refrescar(); };
    const bIdeas = el.querySelector('[data-a="verIdeas"]');
    if (bIdeas) bIdeas.onclick = () => { U.cerrarModal(); R.itinerario.irAQueHacer(v); };
    const bVal = el.querySelector('[data-a="abrirValija"]');
    if (bVal) bVal.onclick = () => { U.cerrarModal(); location.hash = `#viaje/${v.id}/valija`; };
    const bEdit = el.querySelector('[data-a="editarViaje"]');
    if (bEdit) bEdit.onclick = () => R.viajes.abrirAsistente(v);
    const nota = el.querySelector('#tNota');
    nota.addEventListener('input', () => {
      v.tareas[id] = Object.assign({}, v.tareas[id] || { estado: t.estado }, { nota: nota.value });
      guardar(v);
    });
    el.querySelectorAll('[data-estado]').forEach(b => b.onclick = () => {
      U.cerrarModal();
      cambiarEstado(v, id, b.dataset.estado);
    });
    el.querySelector('[data-a="adjuntar"]').onclick = () => {
      R.documentos.subir(v, { tareaId: id, categoria: t.docCategoria, alTerminar: () => abrirTarea(R.db.viaje(v.id), id) });
    };
    el.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => {
      const d = v.documentos.find(x => x.id === b.dataset.doc);
      if (d) R.documentos.abrir(d, v);
    });
    const ed = el.querySelector('[data-a="editarPropia"]');
    if (ed) ed.onclick = () => editarPropia(v, id);
    const bo = el.querySelector('[data-a="borrarPropia"]');
    if (bo) bo.onclick = async () => {
      const ok = await U.confirmar('Se va a eliminar este paso propio.', { textoSi: 'Eliminar', peligro: true });
      if (!ok) return;
      v.tareasPropias = v.tareasPropias.filter(x => x.id !== id);
      delete v.tareas[id];
      v.tareasPropias.forEach(x => { x.dependeDe = (x.dependeDe || []).filter(d => d !== id); });
      guardar(v);
      R.app.refrescar();
    };
  }

  /* ---------------------------------------------------------
     Pasos propios
     --------------------------------------------------------- */
  function editarPropia(v, id) {
    const existente = id ? v.tareasPropias.find(x => x.id === id) : null;
    const todas = R.motor.lista(v).filter(t => t.id !== id);
    const p = existente || { titulo: '', fase: 'experiencias', impacto: 3, fechaManual: '', desc: '', dependeDe: [] };
    U.modal({
      titulo: existente ? 'Editar paso' : 'Nuevo paso propio',
      subtitulo: 'Sumá lo que la guía no contempla. Rutenda lo va a priorizar junto con el resto.',
      cuerpo: `
        <label class="campo"><span>¿Qué hay que hacer? *</span><input id="pTitulo" value="${esc(p.titulo)}" placeholder="Ej: Reservar la cena de aniversario"></label>
        <div class="grilla-2">
          <label class="campo"><span>Fase</span><select id="pFase">${R.guia.fases.map(f => `<option value="${f.id}" ${p.fase === f.id ? 'selected' : ''}>${f.icono} ${f.nombre}</option>`).join('')}</select></label>
          <label class="campo"><span>Para cuándo (opcional)</span><input type="date" id="pFecha" value="${esc(p.fechaManual || '')}"></label>
        </div>
        <label class="campo"><span>Importancia</span>
          <select id="pImpacto">
            <option value="5" ${p.impacto == 5 ? 'selected' : ''}>Crítico: si sale mal, complica el viaje</option>
            <option value="4" ${p.impacto == 4 ? 'selected' : ''}>Alta: cuesta cambiarlo o se agota</option>
            <option value="3" ${p.impacto == 3 ? 'selected' : ''}>Media</option>
            <option value="2" ${p.impacto == 2 ? 'selected' : ''}>Baja</option>
            <option value="1" ${p.impacto == 1 ? 'selected' : ''}>Opcional</option>
          </select>
        </label>
        <label class="campo"><span>Necesita antes (opcional)</span>
          <select id="pDepende"><option value="">Nada en particular</option>${todas.map(t => `<option value="${t.id}" ${(p.dependeDe || [])[0] === t.id ? 'selected' : ''}>${esc(t.titulo)}</option>`).join('')}</select>
        </label>
        <label class="campo"><span>Detalle (opcional)</span><textarea id="pDesc" rows="2">${esc(p.desc || '')}</textarea></label>`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar', clase: 'btn-primario', onClick: el => {
            const titulo = el.querySelector('#pTitulo').value.trim();
            if (!titulo) { U.toast('Escribí qué hay que hacer.'); return false; }
            const dep = el.querySelector('#pDepende').value;
            const nuevo = Object.assign({}, p, {
              id: p.id || U.id('pro'),
              titulo,
              fase: el.querySelector('#pFase').value,
              fechaManual: el.querySelector('#pFecha').value || '',
              impacto: Number(el.querySelector('#pImpacto').value),
              desc: el.querySelector('#pDesc').value.trim(),
              porque: '',
              dependeDe: dep ? [dep] : []
            });
            if (existente) v.tareasPropias = v.tareasPropias.map(x => x.id === nuevo.id ? nuevo : x);
            else v.tareasPropias.push(nuevo);
            guardar(v);
            R.app.refrescar();
            U.toast(existente ? 'Paso actualizado.' : 'Paso agregado a la guía.');
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------
     Cambio de planes
     --------------------------------------------------------- */
  function cambioDePlanes(v) {
    const { el } = U.modal({
      titulo: 'Cambio de planes',
      subtitulo: 'Tranqui, pasa. Marcá qué cambió y armo el orden para reorganizarte.',
      ancho: true,
      cuerpo: `
        <div class="motivos">${R.guia.motivosCambio.map(m => `
          <label class="motivo"><input type="checkbox" value="${m.id}"><span class="motivo-icono">${m.icono}</span><span>${esc(m.nombre)}</span></label>`).join('')}</div>
        <p id="cFechas" class="aviso-suave oculto">📅 Después te abro el cronograma para que cambies las fechas y horarios de cada traslado.</p>
        <p id="cDestino" class="aviso-suave oculto">🧭 Después de armar el plan te abro el viaje para que actualices los destinos (podés agregar, quitar o cambiar el orden).</p>
        <label class="campo"><span>¿Qué pasó? (opcional, queda en el historial)</span><textarea id="cNota" rows="2" placeholder="Ej: la aerolínea canceló el vuelo del 12"></textarea></label>
        ${v.cambios.length ? `<details class="historial-cambios"><summary>Historial de cambios (${v.cambios.length})</summary>${v.cambios.slice().reverse().map(c => `
          <div class="cambio-item"><strong>${new Date(c.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</strong> · ${esc(c.motivos.map(m => (R.guia.motivosCambio.find(x => x.id === m) || {}).nombre || m).join(', '))}${c.nota ? `<p>${esc(c.nota)}</p>` : ''}</div>`).join('')}</details>` : ''}`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Armar plan', clase: 'btn-primario', onClick: el2 => {
            const motivos = Array.from(el2.querySelectorAll('.motivo input:checked')).map(x => x.value);
            if (!motivos.length) { U.toast('Marcá al menos una cosa que haya cambiado.'); return false; }
            R.motor.replanificar(v, motivos, el2.querySelector('#cNota').value.trim());
            R.viajes.marcarRaizResuelta(v, motivos.filter(m => m !== 'destino' && m !== 'fechas'));
            guardar(v);
            U.cerrarModal();
            R.app.refrescar();
            if (motivos.includes('destino')) {
              R.viajes.abrirAsistente(v);
              U.toast('Actualizá los destinos. El plan te queda en la guía: "Ver plan ordenado".');
            } else if (motivos.includes('fechas')) {
              R.itinerario.editarCronograma(v, { alGuardar: () => mostrarPlan(v, R.motor.ordenarPlan(v, R.motor.pasosARevisar(v))) });
            } else {
              mostrarPlan(v, R.motor.ordenarPlan(v, R.motor.pasosARevisar(v)));
            }
            return false;
          }
        }
      ]
    });
    const actualizar = () => {
      const marcados = Array.from(el.querySelectorAll('.motivo input:checked')).map(x => x.value);
      el.querySelector('#cFechas').classList.toggle('oculto', !marcados.includes('fechas'));
      el.querySelector('#cDestino').classList.toggle('oculto', !marcados.includes('destino'));
      el.querySelectorAll('.motivo').forEach(m => m.classList.toggle('activo', m.querySelector('input').checked));
    };
    el.querySelectorAll('.motivo input').forEach(x => x.onchange = actualizar);
  }

  function mostrarPlan(v, plan) {
    if (!plan.length) {
      U.toast('No quedó ningún paso para reorganizar. ¡Todo en orden!');
      return;
    }
    const { el } = U.modal({
      titulo: 'Tu plan de reorganización',
      subtitulo: 'Ordené los pasos por impacto, urgencia y qué depende de qué. Andá de arriba hacia abajo.',
      ancho: true,
      cuerpo: `<ol class="plan">${plan.map((t, i) => `
        <li class="plan-item" data-tarea="${t.id}">
          <span class="plan-num">${i + 1}</span>
          <div>
            <strong>${R.guia.fase(t.fase).icono} ${esc(t.titulo)}</strong>
            <p>${esc(t.motivoOrden || '')}</p>
            ${t.fechaLimite ? `<small>${t.diasRestantes < 0 ? '⏰ Ya está atrasado' : 'Ideal antes del ' + U.fmtFecha(t.fechaLimite, 'corto')}</small>` : ''}
          </div>
        </li>`).join('')}</ol>`,
      acciones: [
        { texto: 'Cerrar' },
        { texto: 'Empezar por el paso 1', clase: 'btn-primario', onClick: () => { U.cerrarModal(); abrirTarea(R.db.viaje(v.id), plan[0].id); return false; } }
      ]
    });
    el.querySelectorAll('[data-tarea]').forEach(x => x.onclick = () => { U.cerrarModal(); abrirTarea(R.db.viaje(v.id), x.dataset.tarea); });
  }

  return { render, abrirTarea, cambioDePlanes, mostrarPlan, cambiarEstado };
})();
