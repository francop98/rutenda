/* =========================================================
   Rutenda — armador de valija
   - Pestaña Valija de cada viaje: lista libre (escribís lo que
     quieras), listas personalizadas que se COPIAN al viaje,
     sugerencias según el viaje y armado paso a paso.
   - Pantalla "Mis listas": donde se crean y editan las listas
     personalizadas. Lo que agregás en un viaje NO cambia la lista.
   ========================================================= */
window.R = window.R || {};

R.valija = (function () {
  const U = R.util;
  const { esc } = U;
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  const CATEGORIAS = [
    { id: 'documentos', nombre: 'Documentos y dinero', icono: '🛂' },
    { id: 'mano', nombre: 'Equipaje de mano', icono: '🎒' },
    { id: 'ropa', nombre: 'Ropa', icono: '👕' },
    { id: 'calzado', nombre: 'Calzado', icono: '👟' },
    { id: 'higiene', nombre: 'Higiene', icono: '🧴' },
    { id: 'salud', nombre: 'Botiquín', icono: '💊' },
    { id: 'electronica', nombre: 'Electrónica', icono: '🔌' },
    { id: 'ninos', nombre: 'Chicos', icono: '🧸' },
    { id: 'mascota', nombre: 'Mascota', icono: '🐾' },
    { id: 'otros', nombre: 'Otros', icono: '📦' }
  ];
  const categoria = id => CATEGORIAS.find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];
  const opcionesCategoria = sel => CATEGORIAS.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icono} ${c.nombre}</option>`).join('');

  /* ---------- Datos del viaje ---------- */
  /** La valija de una persona del viaje (por defecto, la tuya). Cada viajero arma la suya. */
  function valijaDe(v, personaId) {
    const pid = personaId || R.db.yoEn(v);
    v.valijas = v.valijas || {};
    const val = v.valijas[pid] = v.valijas[pid] || { items: [], listas: [] };
    val.items = val.items || [];
    val.listas = val.listas || [];
    return val;
  }
  function existe(v, texto) { return valijaDe(v).items.some(i => normal(i.texto) === normal(texto)); }
  function agregarItem(v, texto, cat, origen) {
    if (!texto.trim() || existe(v, texto)) return false;
    valijaDe(v).items.push({ id: U.id('val'), texto: texto.trim(), categoria: cat || 'otros', hecho: false, origen: origen || null });
    return true;
  }
  /**
   * Ida: lo que hay que guardar para salir.
   * Vuelta: lo que llevaste (y lo que compraste allá) para asegurarte de volver con todo.
   */
  function itemsDe(v, modo, personaId) {
    const items = valijaDe(v, personaId).items;
    return modo === 'vuelta' ? items.filter(i => i.hecho || i.soloVuelta) : items.filter(i => !i.soloVuelta);
  }
  const listo = (i, modo) => modo === 'vuelta' ? (i.vuelta || i.noVuelve) : i.hecho;
  function progreso(v, modo, personaId) {
    const m = modo || 'ida';
    const items = itemsDe(v, m, personaId);
    const hechos = items.filter(i => listo(i, m)).length;
    return { hechos, total: items.length, pct: items.length ? Math.round(hechos / items.length * 100) : 0 };
  }
  const modoPorViaje = {};
  function modoDe(v) {
    if (modoPorViaje[v.id]) return modoPorViaje[v.id];
    const est = R.viajes.estadoViaje(v);
    return est === 'planificando' || !itemsDe(v, 'vuelta').length ? 'ida' : 'vuelta';
  }

  /** Sugerencias pensadas para este viaje (no se agregan solas). */
  function sugerencias(v) {
    const r = [];
    const s = (cat, texto) => { if (!existe(v, texto) && !r.some(x => normal(x[1]) === normal(texto))) r.push([cat, texto]); };
    const req = R.requisitos.analizar(v);
    const dias = v.fechaInicio && v.fechaFin ? U.diasEntre(v.fechaInicio, v.fechaFin) + 1 : null;
    s('documentos', req.necesitaPasaporte ? 'Pasaporte de cada viajero' : 'DNI vigente de cada viajero');
    s('documentos', 'Tarjetas y efectivo');
    s('documentos', 'Reservas y pasajes en el celular');
    if (req.tramites.length) s('documentos', `Comprobante de ${req.tramites.map(t => t.tramite || 'visa').join(' y ')}`);
    if (req.fiebreAmarilla.length) s('documentos', 'Certificado de vacuna de fiebre amarilla');
    if (R.motor.estado(v, 'p_seguro') === 'hecha') s('documentos', 'Voucher del seguro de viaje');
    if (v.perfil.alquilaAuto) s('documentos', 'Licencia de conducir');
    if (R.recorrido.usaMedio(v, 'avion')) { s('mano', 'Cargador y batería externa (van en la mano)'); s('mano', 'Líquidos en envases de hasta 100 ml'); s('mano', 'Una muda de ropa en la mano'); }
    if (dias) { s('ropa', `Ropa interior (${dias})`); s('ropa', `Medias (${dias})`); s('ropa', `Remeras (${Math.min(dias, 7)})`); }
    else { s('ropa', 'Ropa interior'); s('ropa', 'Medias'); s('ropa', 'Remeras'); }
    s('ropa', 'Pijama');
    s('calzado', 'Zapatillas cómodas para caminar');
    s('higiene', 'Cepillo y pasta de dientes'); s('higiene', 'Desodorante');
    s('salud', 'Medicación habitual (con receta)'); s('salud', 'Analgésicos');
    s('electronica', 'Celular y cargador');
    if (v.perfil.internacional) s('electronica', 'Adaptador de enchufe');
    if (req.dengue) s('salud', 'Repelente de mosquitos');

    // Clima aproximado por latitud y mes del viaje
    const mes = v.fechaInicio ? U.aFecha(v.fechaInicio).getMonth() + 1 : null;
    const lats = (v.destinos || []).map(d => d.lat).filter(x => x != null);
    if (lats.length && mes) {
      const invernoSur = mes >= 5 && mes <= 9, invernoNorte = mes >= 11 || mes <= 3;
      if (lats.some(l => (l < -35 && invernoSur) || (l > 40 && invernoNorte))) { s('ropa', 'Campera de abrigo'); s('ropa', 'Gorro, guantes y bufanda'); }
      if (lats.some(l => l > -30 && l < 30) || lats.some(l => l < -30 && (mes >= 12 || mes <= 2))) { s('ropa', 'Traje de baño'); s('higiene', 'Protector solar'); s('otros', 'Lentes de sol'); }
    }
    if (v.perfil.menores) { s('ninos', 'Documentos de los chicos'); s('ninos', 'Entretenimiento para el viaje'); s('ninos', 'Snacks'); }
    if (v.perfil.viajaConMascota) { s('mascota', 'Transportadora'); s('mascota', 'Comida y platos'); s('mascota', 'Certificado veterinario'); }
    if (v.perfil.equipamiento) s('otros', 'Equipo y ropa para la actividad');
    if (v.perfil.eventoEspecial) s('ropa', 'Ropa para el evento especial');
    if (R.recorrido.usaMedio(v, 'auto')) { s('otros', 'Documentación y seguro del auto'); s('otros', 'Kit de emergencia del auto'); }
    return r;
  }

  /* ---------- Pestaña del viaje ---------- */
  function render(v, cont) {
    const val = valijaDe(v);
    const modo = modoDe(v);
    const ida = modo === 'ida';
    const prog = progreso(v, modo);
    const sug = ida ? sugerencias(v) : [];
    const listas = R.db.listasValija();
    const items = itemsDe(v, modo);
    const grupos = CATEGORIAS.map(c => ({ c, items: items.filter(i => i.categoria === c.id) })).filter(g => g.items.length);

    cont.innerHTML = `
      <div class="bloque-cab cab-seccion">
        <div>
          <h2 class="titulo-seccion">Armador de valija</h2>
          <p class="texto-suave">${ida
            ? (prog.total ? `${prog.hechos} de ${prog.total} cosas guardadas para salir.` : 'Sumá lo sugerido para este viaje o escribí lo que quieras.')
            : (prog.total ? `${prog.hechos} de ${prog.total} cosas listas para volver.` : 'Cuando armes la valija de ida, acá vas a poder chequear que vuelvas con todo.')}</p>
        </div>
        ${prog.total ? `<button class="btn btn-primario" data-a="armar">${ida ? '🧳 Armar paso a paso' : '🏠 Chequear la vuelta'}</button>` : ''}
      </div>
      <div class="segmentado segmentado-valija">
        <button type="button" data-modo-valija="ida" class="${ida ? 'activo' : ''}">🛫 Para ir</button>
        <button type="button" data-modo-valija="vuelta" class="${!ida ? 'activo' : ''}">🛬 Para volver</button>
      </div>
      ${prog.total ? `<div class="barra-progreso barra-valija"><span style="width:${prog.pct}%"></span></div>` : ''}
      ${otrasValijasHTML(v, modo)}

      <div class="valija-grilla">
        <div>
          <div class="bloque">
            <h3 class="bloque-titulo">${ida ? 'Agregar a esta valija' : 'Algo nuevo que traés'}</h3>
            <div class="fila-agregar fila-valija">
              <input id="vjTexto" placeholder="${ida ? 'Agregá algo más' : 'Ej: regalos, artesanías, compras'}">
              <select id="vjCat">${opcionesCategoria('otros')}</select>
              <button class="btn btn-primario" data-a="agregar">Agregar</button>
            </div>
            <p class="ayuda">${ida ? 'Queda solo en este viaje.' : 'Tocá cada cosa cuando la guardes. Si algo no vuelve (se terminó o lo regalaste), marcá "No vuelve".'}</p>
          </div>

          ${grupos.length ? grupos.map(g => `
            <div class="bloque bloque-valija">
              <h3 class="bloque-titulo">${g.c.icono} ${esc(g.c.nombre)} <span class="contador">${g.items.filter(i => listo(i, modo)).length}/${g.items.length}</span></h3>
              <ul class="lista-valija checklist">${g.items.map(i => `
                <li class="${listo(i, modo) ? 'hecho' : ''} ${!ida && i.noVuelve ? 'no-vuelve' : ''}">
                  <label><input type="checkbox" data-item="${i.id}" ${(ida ? i.hecho : i.vuelta) ? 'checked' : ''} ${!ida && i.noVuelve ? 'disabled' : ''}><span>${esc(i.texto)}${i.soloVuelta ? ' <small class="origen-lista">nuevo</small>' : ''}</span></label>
                  ${ida ? (i.origen ? `<small class="origen-lista">${esc(nombreLista(i.origen))}</small>` : '') : `<button class="btn-texto-mini" data-no-vuelve="${i.id}">${i.noVuelve ? 'Vuelve' : 'No vuelve'}</button>`}
                  ${ida || i.soloVuelta ? `<button class="btn-icono" data-borrar="${i.id}" title="Quitar">×</button>` : ''}
                </li>`).join('')}</ul>
            </div>`).join('') : `
            <div class="vacio">
              <div class="vacio-icono">${ida ? '🧳' : '🏠'}</div>
              <h3>${ida ? 'Tu valija está vacía' : 'Todavía no hay nada para chequear'}</h3>
              <p>${ida ? 'Arrancá con las sugerencias o escribí lo que quieras.' : 'Primero tildá lo que guardás para ir: eso es lo que después tenés que traer de vuelta.'}</p>
            </div>`}
        </div>

        ${ida ? `<aside class="col-lateral">
          <div class="bloque">
            <h4>Mis listas</h4>
            <p class="texto-suave">Se copian a este viaje sin cambiar la original.</p>
            ${listas.length ? `<div class="listas-elegir">${listas.map(l => `
              <button class="lista-op ${val.listas.includes(l.id) ? 'usada' : ''}" data-lista="${l.id}">
                <span><strong>${esc(l.nombre)}</strong><small>${U.plural(l.items.length, 'cosa', 'cosas')}${val.listas.includes(l.id) ? ' · ya agregada' : ''}</small></span>
                <span>${val.listas.includes(l.id) ? '↻' : '+'}</span>
              </button>`).join('')}</div>` : '<p class="texto-suave">Todavía no creaste ninguna.</p>'}
            <a href="#valijas" class="btn btn-suave btn-chico">Administrar mis listas</a>
          </div>
          ${sug.length ? `
            <div class="bloque">
              <h4>Sugeridos para este viaje</h4>
              <p class="texto-suave">Según destino, fechas y transporte.</p>
              <ul class="lista-sugerencias">${sug.map((x, i) => `<li><span>${categoria(x[0]).icono} ${esc(x[1])}</span><button class="btn-icono" data-sug="${i}" title="Agregar">+</button></li>`).join('')}</ul>
              <button class="btn btn-suave btn-chico" data-a="todasSug">Agregar todas</button>
            </div>` : ''}
        </aside>` : ''}
      </div>`;

    const guardarYRefrescar = msg => { R.db.guardarViaje(v); revisarCompleta(v); R.app.refrescar(); if (msg) U.toast(msg); };
    cont.querySelectorAll('[data-modo-valija]').forEach(b => b.onclick = () => { modoPorViaje[v.id] = b.dataset.modoValija; R.app.refrescar(); });
    const input = cont.querySelector('#vjTexto');
    const agregar = () => {
      const t = input.value.trim();
      if (!t) return;
      if (!agregarItem(v, t, cont.querySelector('#vjCat').value, null)) { U.toast('Eso ya está en la valija.'); return; }
      if (!ida) { const it = val.items[val.items.length - 1]; it.soloVuelta = true; }
      guardarYRefrescar();
      setTimeout(() => { const i = document.getElementById('vjTexto'); if (i) i.focus(); }, 30);
    };
    cont.querySelector('[data-a="agregar"]').onclick = agregar;
    input.onkeydown = e => { if (e.key === 'Enter') agregar(); };
    cont.querySelectorAll('[data-item]').forEach(x => x.onchange = () => {
      const it = val.items.find(i => i.id === x.dataset.item);
      if (ida) it.hecho = x.checked; else it.vuelta = x.checked;
      guardarYRefrescar();
    });
    cont.querySelectorAll('[data-no-vuelve]').forEach(x => x.onclick = () => {
      const it = val.items.find(i => i.id === x.dataset.noVuelve);
      it.noVuelve = !it.noVuelve;
      guardarYRefrescar();
    });
    cont.querySelectorAll('[data-borrar]').forEach(x => x.onclick = () => {
      val.items = val.items.filter(i => i.id !== x.dataset.borrar);
      guardarYRefrescar();
    });
    cont.querySelectorAll('[data-sug]').forEach(x => x.onclick = () => {
      const [cat, texto] = sug[Number(x.dataset.sug)];
      agregarItem(v, texto, cat, null);
      guardarYRefrescar();
    });
    const todas = cont.querySelector('[data-a="todasSug"]');
    if (todas) todas.onclick = () => { sug.forEach(([cat, texto]) => agregarItem(v, texto, cat, null)); guardarYRefrescar(`${U.plural(sug.length, 'sugerencia agregada', 'sugerencias agregadas')}.`); };
    cont.querySelectorAll('[data-lista]').forEach(x => x.onclick = () => {
      const l = R.db.listasValija().find(y => y.id === x.dataset.lista);
      let n = 0;
      l.items.forEach(it => { if (agregarItem(v, it.texto, it.categoria, l.id)) n++; });
      if (!val.listas.includes(l.id)) val.listas.push(l.id);
      guardarYRefrescar(n ? `Agregué ${U.plural(n, 'cosa', 'cosas')} de "${l.nombre}".` : `Todo lo de "${l.nombre}" ya estaba en la valija.`);
    });
    const armar = cont.querySelector('[data-a="armar"]');
    if (armar) armar.onclick = () => armarPasoAPaso(v, modo);
    cont.querySelectorAll('[data-ver-valija]').forEach(b => b.onclick = () => verValija(v, b.dataset.verValija, modo));
  }

  /** Cómo van las valijas del resto (solo para mirar). */
  function otrasValijasHTML(v, modo) {
    const yo = R.db.yoEn(v);
    const otros = (v.participantes || []).filter(pid => pid !== yo && v.valijas && v.valijas[pid] && (v.valijas[pid].items || []).length);
    if (!otros.length) return '';
    return `<div class="otras-valijas"><small>Las valijas del resto:</small>${otros.map(pid => {
      const p = R.db.persona(pid) || { nombre: 'Viajero' };
      const pr = progreso(v, modo, pid);
      return `<button class="chip-persona" data-ver-valija="${pid}">${U.avatar(p, 22)} ${esc(p.nombre)} <small>${pr.hechos}/${pr.total}</small></button>`;
    }).join('')}</div>`;
  }
  function verValija(v, pid, modo) {
    const p = R.db.persona(pid) || { nombre: 'Viajero' };
    const items = itemsDe(v, modo, pid);
    U.modal({
      titulo: `La valija de ${p.nombre}`,
      subtitulo: modo === 'vuelta' ? 'Para volver' : 'Para ir',
      cuerpo: `<ul class="lista-valija checklist">${items.map(i => `<li class="${listo(i, modo) ? 'hecho' : ''}"><label><input type="checkbox" disabled ${listo(i, modo) ? 'checked' : ''}><span>${esc(i.texto)}</span></label></li>`).join('')}</ul>`,
      acciones: [{ texto: 'Cerrar', clase: 'btn-primario' }]
    });
  }

  function nombreLista(id) { const l = R.db.listasValija().find(x => x.id === id); return l ? l.nombre : 'Lista'; }

  /** Si está todo en la valija para ir, el paso queda resuelto; avisa también al completar la vuelta. */
  let avisoVuelta = {};
  function revisarCompleta(v) {
    const p = progreso(v, 'ida');
    const id = R.motor.idsDe(v, 's_valija')[0];
    if (id && p.total && p.hechos === p.total && R.motor.estado(v, id) !== 'hecha') {
      R.motor.setEstado(v, id, 'hecha');
      R.db.guardarViaje(v);
      setTimeout(() => U.toast('¡Valija lista para salir! 🧳'), 400);
    }
    const pv = progreso(v, 'vuelta');
    if (pv.total && pv.hechos === pv.total && !avisoVuelta[v.id]) {
      avisoVuelta[v.id] = true;
      setTimeout(() => U.toast('¡Volvés con todo! 🏠'), 400);
    } else if (pv.hechos < pv.total) avisoVuelta[v.id] = false;
  }

  /* ---------- Armado paso a paso (checklist por categoría) ---------- */
  function armarPasoAPaso(v, modo) {
    const ida = modo !== 'vuelta';
    const val = valijaDe(v);
    const todos = () => itemsDe(v, modo);
    const pasos = CATEGORIAS.filter(c => todos().some(i => i.categoria === c.id));
    let paso = Math.max(0, pasos.findIndex(c => todos().some(i => i.categoria === c.id && !listo(i, modo))));
    const { el } = U.modal({
      titulo: ida ? 'Armemos la valija' : 'Chequeo para volver',
      subtitulo: ida ? 'Una categoría a la vez. Tocá lo que ya guardaste.' : 'Revisá que vuelvas con todo lo que llevaste.',
      ancho: true, cuerpo: '<div id="armado"></div>',
      alCerrar: () => { revisarCompleta(v); R.app.refrescar(); }
    });
    const cont = el.querySelector('#armado');

    function pintar() {
      const fin = paso >= pasos.length;
      const p = progreso(v, modo);
      if (fin) {
        const faltan = todos().filter(i => !listo(i, modo));
        cont.innerHTML = `
          <div class="celebrar">
            <div class="celebrar-sol">${faltan.length ? (ida ? '🧳' : '🔎') : '🎉'}</div>
            <h3>${faltan.length ? `Te ${faltan.length === 1 ? 'falta' : 'faltan'} ${U.plural(faltan.length, 'cosa', 'cosas')}` : (ida ? '¡Valija lista!' : '¡Volvés con todo!')}</h3>
            ${faltan.length ? `<ul class="lista-faltan">${faltan.map(i => `<li>${categoria(i.categoria).icono} ${esc(i.texto)}</li>`).join('')}</ul>` : `<p>${ida ? 'Todo guardado. Buen viaje.' : 'No te olvidás nada. Buen regreso.'}</p>`}
          </div>
          <div class="asistente-pie">
            <button type="button" class="btn btn-suave" data-a="atras">← Volver</button>
            <button type="button" class="btn btn-primario" data-a="cerrar">Listo</button>
          </div>`;
      } else {
        const c = pasos[paso];
        const items = todos().filter(i => i.categoria === c.id);
        cont.innerHTML = `
          <div class="paso-movil visible"><span>${c.icono} ${paso + 1} de ${pasos.length}</span><strong>${esc(c.nombre)}</strong>
            <span class="pm-puntos">${pasos.map((x, i) => `<i class="${i < paso ? 'listo' : i === paso ? 'actual' : ''}"></i>`).join('')}</span></div>
          <div class="barra-progreso barra-valija"><span style="width:${p.pct}%"></span></div>
          <ul class="lista-valija checklist grande">${items.map(i => `
            <li class="${listo(i, modo) ? 'hecho' : ''} ${!ida && i.noVuelve ? 'no-vuelve' : ''}"><label><input type="checkbox" data-item="${i.id}" ${(ida ? i.hecho : i.vuelta) ? 'checked' : ''} ${!ida && i.noVuelve ? 'disabled' : ''}><span>${esc(i.texto)}</span></label>
              ${!ida ? `<button type="button" class="btn-texto-mini" data-no-vuelve="${i.id}">${i.noVuelve ? 'Vuelve' : 'No vuelve'}</button>` : ''}</li>`).join('')}</ul>
          ${ida ? `<div class="fila-agregar">
            <input id="arTexto" placeholder="¿Algo más de ${esc(c.nombre.toLowerCase())}?">
            <button type="button" class="btn btn-suave" data-a="agregar">Agregar</button>
          </div>` : ''}
          <div class="asistente-pie">
            <button type="button" class="btn btn-suave" data-a="atras" ${paso === 0 ? 'style="visibility:hidden"' : ''}>← Atrás</button>
            <button type="button" class="btn btn-primario" data-a="seguir">${paso === pasos.length - 1 ? 'Terminar' : 'Siguiente →'}</button>
          </div>`;
        cont.querySelectorAll('[data-item]').forEach(x => x.onchange = () => {
          const it = val.items.find(i => i.id === x.dataset.item);
          if (ida) it.hecho = x.checked; else it.vuelta = x.checked;
          R.db.guardarViaje(v);
          x.closest('li').classList.toggle('hecho', x.checked);
          cont.querySelector('.barra-valija span').style.width = progreso(v, modo).pct + '%';
        });
        cont.querySelectorAll('[data-no-vuelve]').forEach(x => x.onclick = () => {
          const it = val.items.find(i => i.id === x.dataset.noVuelve);
          it.noVuelve = !it.noVuelve;
          R.db.guardarViaje(v);
          pintar();
        });
        const inp = cont.querySelector('#arTexto');
        if (inp) {
          const agregar = () => { if (agregarItem(v, inp.value, c.id, null)) { R.db.guardarViaje(v); pintar(); cont.querySelector('#arTexto').focus(); } };
          cont.querySelector('[data-a="agregar"]').onclick = agregar;
          inp.onkeydown = e => { if (e.key === 'Enter') agregar(); };
        }
        cont.querySelector('[data-a="seguir"]').onclick = () => { paso++; pintar(); };
      }
      const atras = cont.querySelector('[data-a="atras"]');
      if (atras) atras.onclick = () => { paso = Math.max(0, paso - 1); pintar(); };
      const cerrar = cont.querySelector('[data-a="cerrar"]');
      if (cerrar) cerrar.onclick = () => U.cerrarModal();
    }
    pintar();
  }

  /* ---------- Pantalla "Mis listas" ---------- */
  function renderMisListas(app) {
    const listas = R.db.listasValija();
    app.innerHTML = `
      <section class="encabezado-simple">
        <h1>Mis listas de valija</h1>
        <p class="texto-suave">Lo que llevás siempre. En cada viaje la sumás con un toque.</p>
      </section>
      <div class="acciones-fila">
        <button class="btn btn-primario" data-a="nueva">+ Nueva lista</button>
      </div>
      ${listas.length ? `<div class="grilla-listas">${listas.map(l => `
        <article class="bloque lista-personal" data-id="${l.id}">
          <div class="bloque-cab">
            <input class="titulo-lista" data-renombrar="${l.id}" value="${esc(l.nombre)}" aria-label="Nombre de la lista">
            <button class="btn-icono" data-eliminar="${l.id}" title="Eliminar lista">🗑</button>
          </div>
          ${CATEGORIAS.filter(c => l.items.some(i => i.categoria === c.id)).map(c => `
            <div class="lp-grupo"><small>${c.icono} ${esc(c.nombre)}</small>
              <ul class="lista-chips">${l.items.filter(i => i.categoria === c.id).map(i => `<li>${esc(i.texto)} <button data-quitar="${l.id}|${i.id}" aria-label="Quitar">×</button></li>`).join('')}</ul>
            </div>`).join('') || '<p class="texto-suave">Lista vacía.</p>'}
          <div class="fila-agregar fila-valija">
            <input data-texto="${l.id}" placeholder="Agregar a esta lista">
            <select data-cat="${l.id}">${opcionesCategoria('otros')}</select>
            <button class="btn btn-suave" data-agregar="${l.id}">+</button>
          </div>
        </article>`).join('')}</div>` : `
        <div class="vacio">
          <div class="vacio-icono">📝</div>
          <h3>Todavía no tenés listas</h3>
          <p>Por ejemplo: "Playa", "Nieve", "Viaje de trabajo". Después las sumás a cualquier viaje con un toque.</p>
        </div>`}`;

    const guardar = l => { R.db.guardarListaValija(l); R.app.refrescar(); };
    app.querySelector('[data-a="nueva"]').onclick = () => {
      const l = { id: U.id('lst'), nombre: 'Nueva lista', items: [] };
      R.db.guardarListaValija(l);
      R.app.refrescar();
      setTimeout(() => { const i = document.querySelector(`[data-renombrar="${l.id}"]`); if (i) { i.focus(); i.select(); } }, 30);
    };
    app.querySelectorAll('[data-renombrar]').forEach(x => x.onchange = () => {
      const l = R.db.listasValija().find(y => y.id === x.dataset.renombrar);
      l.nombre = x.value.trim() || 'Lista sin nombre';
      R.db.guardarListaValija(l);
      U.toast('Nombre guardado.');
    });
    app.querySelectorAll('[data-eliminar]').forEach(x => x.onclick = async () => {
      const l = R.db.listasValija().find(y => y.id === x.dataset.eliminar);
      if (!await U.confirmar(`¿Eliminar la lista "${l.nombre}"? Los viajes donde ya la usaste no cambian.`, { textoSi: 'Eliminar', peligro: true })) return;
      R.db.eliminarListaValija(l.id);
      R.app.refrescar();
    });
    app.querySelectorAll('[data-quitar]').forEach(x => x.onclick = () => {
      const [lid, iid] = x.dataset.quitar.split('|');
      const l = R.db.listasValija().find(y => y.id === lid);
      l.items = l.items.filter(i => i.id !== iid);
      guardar(l);
    });
    app.querySelectorAll('[data-agregar]').forEach(b => {
      const lid = b.dataset.agregar;
      const input = app.querySelector(`[data-texto="${lid}"]`);
      const hacer = () => {
        const t = input.value.trim();
        if (!t) return;
        const l = R.db.listasValija().find(y => y.id === lid);
        if (l.items.some(i => normal(i.texto) === normal(t))) { U.toast('Ya está en la lista.'); return; }
        l.items.push({ id: U.id('it'), texto: t, categoria: app.querySelector(`[data-cat="${lid}"]`).value });
        guardar(l);
        setTimeout(() => { const i = document.querySelector(`[data-texto="${lid}"]`); if (i) i.focus(); }, 30);
      };
      b.onclick = hacer;
      input.onkeydown = e => { if (e.key === 'Enter') hacer(); };
    });
  }

  return { render, renderMisListas, sugerencias, progreso, valijaDe, CATEGORIAS };
})();
