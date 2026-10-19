/* =========================================================
   Tripbox — armador de valija
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
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

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

  const BASICO = [
    ['documentos', 'DNI / pasaporte'], ['documentos', 'Tarjetas y efectivo'], ['documentos', 'Reservas y pasajes en el celular'],
    ['ropa', 'Ropa interior'], ['ropa', 'Medias'], ['ropa', 'Remeras'], ['ropa', 'Pantalones'], ['ropa', 'Abrigo'], ['ropa', 'Pijama'],
    ['calzado', 'Zapatillas cómodas'], ['calzado', 'Ojotas'],
    ['higiene', 'Cepillo y pasta de dientes'], ['higiene', 'Desodorante'], ['higiene', 'Shampoo y acondicionador'], ['higiene', 'Protector solar'],
    ['salud', 'Medicación habitual'], ['salud', 'Analgésicos'], ['salud', 'Curitas'],
    ['electronica', 'Celular y cargador'], ['electronica', 'Auriculares'], ['electronica', 'Batería externa'],
    ['otros', 'Lentes de sol'], ['otros', 'Botella reutilizable']
  ];

  /* ---------- Datos del viaje ---------- */
  function valijaDe(v) {
    v.valija = v.valija || { items: [], listas: [] };
    v.valija.items = v.valija.items || [];
    v.valija.listas = v.valija.listas || [];
    return v.valija;
  }
  function existe(v, texto) { return valijaDe(v).items.some(i => normal(i.texto) === normal(texto)); }
  function agregarItem(v, texto, cat, origen) {
    if (!texto.trim() || existe(v, texto)) return false;
    valijaDe(v).items.push({ id: U.id('val'), texto: texto.trim(), categoria: cat || 'otros', hecho: false, origen: origen || null });
    return true;
  }
  function progreso(v) {
    const items = valijaDe(v).items;
    const hechos = items.filter(i => i.hecho).length;
    return { hechos, total: items.length, pct: items.length ? Math.round(hechos / items.length * 100) : 0 };
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
    if (v.perfil.transporte === 'avion') { s('mano', 'Cargador y batería externa (van en la mano)'); s('mano', 'Líquidos en envases de hasta 100 ml'); s('mano', 'Una muda de ropa en la mano'); }
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
    if (v.perfil.transporte === 'auto') { s('otros', 'Documentación y seguro del auto'); s('otros', 'Kit de emergencia del auto'); }
    return r;
  }

  /* ---------- Pestaña del viaje ---------- */
  function render(v, cont) {
    const val = valijaDe(v);
    const prog = progreso(v);
    const sug = sugerencias(v);
    const listas = R.db.listasValija();
    const grupos = CATEGORIAS.map(c => ({ c, items: val.items.filter(i => i.categoria === c.id) })).filter(g => g.items.length);

    cont.innerHTML = `
      <div class="bloque-cab cab-seccion">
        <div>
          <h2 class="titulo-seccion">Armador de valija</h2>
          <p class="texto-suave">${prog.total ? `${prog.hechos} de ${prog.total} cosas en la valija.` : 'Armá tu lista como quieras: libre, con tus listas personalizadas o con sugerencias para este viaje.'}</p>
        </div>
        <div class="acciones-fila">
          ${prog.total ? '<button class="btn btn-primario" data-a="armar">🧳 Armar paso a paso</button>' : ''}
        </div>
      </div>

      ${prog.total ? `<div class="barra-progreso barra-valija"><span style="width:${prog.pct}%"></span></div>` : ''}

      <div class="valija-grilla">
        <div>
          <div class="bloque">
            <h3 class="bloque-titulo">Agregar a esta valija</h3>
            <div class="fila-agregar fila-valija">
              <input id="vjTexto" placeholder="Escribí lo que necesites (ej: cámara de fotos)">
              <select id="vjCat">${opcionesCategoria('otros')}</select>
              <button class="btn btn-primario" data-a="agregar">Agregar</button>
            </div>
            <p class="ayuda">Lo que agregues acá queda solo en este viaje: no cambia tus listas personalizadas.</p>
          </div>

          ${grupos.length ? grupos.map(g => `
            <div class="bloque bloque-valija">
              <h3 class="bloque-titulo">${g.c.icono} ${esc(g.c.nombre)} <span class="contador">${g.items.filter(i => i.hecho).length}/${g.items.length}</span></h3>
              <ul class="lista-valija">${g.items.map(i => `
                <li class="${i.hecho ? 'hecho' : ''}">
                  <label><input type="checkbox" data-item="${i.id}" ${i.hecho ? 'checked' : ''}><span>${esc(i.texto)}</span></label>
                  ${i.origen ? `<small class="origen-lista">${esc(nombreLista(i.origen))}</small>` : ''}
                  <button class="btn-icono" data-borrar="${i.id}" title="Quitar">×</button>
                </li>`).join('')}</ul>
            </div>`).join('') : `
            <div class="vacio">
              <div class="vacio-icono">🧳</div>
              <h3>Tu valija está vacía</h3>
              <p>Elegí cómo arrancar: una de tus listas, las sugerencias para este viaje o escribí lo que quieras arriba (lista libre).</p>
            </div>`}
        </div>

        <aside class="col-lateral">
          <div class="bloque">
            <h4>Mis listas personalizadas</h4>
            <p class="texto-suave">Se copian a este viaje; después podés sumar o quitar cosas sin tocar la lista original.</p>
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
              <p class="texto-suave">Según destino, fechas, transporte y viajeros.</p>
              <ul class="lista-sugerencias">${sug.map((x, i) => `<li><span>${categoria(x[0]).icono} ${esc(x[1])}</span><button class="btn-icono" data-sug="${i}" title="Agregar">+</button></li>`).join('')}</ul>
              <button class="btn btn-suave btn-chico" data-a="todasSug">Agregar todas</button>
            </div>` : ''}
        </aside>
      </div>`;

    const guardarYRefrescar = msg => { R.db.guardarViaje(v); revisarCompleta(v); R.app.refrescar(); if (msg) U.toast(msg); };
    const input = cont.querySelector('#vjTexto');
    const agregar = () => {
      const t = input.value.trim();
      if (!t) return;
      if (!agregarItem(v, t, cont.querySelector('#vjCat').value, null)) { U.toast('Eso ya está en la valija.'); return; }
      guardarYRefrescar();
      setTimeout(() => { const i = document.getElementById('vjTexto'); if (i) i.focus(); }, 30);
    };
    cont.querySelector('[data-a="agregar"]').onclick = agregar;
    input.onkeydown = e => { if (e.key === 'Enter') agregar(); };
    cont.querySelectorAll('[data-item]').forEach(x => x.onchange = () => {
      const it = val.items.find(i => i.id === x.dataset.item);
      it.hecho = x.checked;
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
    if (armar) armar.onclick = () => armarPasoAPaso(v);
  }

  function nombreLista(id) { const l = R.db.listasValija().find(x => x.id === id); return l ? l.nombre : 'Lista'; }

  /** Si está todo en la valija, el paso de la guía queda resuelto. */
  function revisarCompleta(v) {
    const p = progreso(v);
    const id = R.motor.idsDe(v, 's_valija')[0];
    if (!id) return;
    if (p.total && p.hechos === p.total && R.motor.estado(v, id) !== 'hecha') {
      R.motor.setEstado(v, id, 'hecha');
      R.db.guardarViaje(v);
      setTimeout(() => U.toast('¡Valija lista! Lo marqué en la guía. 🧳'), 400);
    }
  }

  /* ---------- Armado paso a paso ---------- */
  function armarPasoAPaso(v) {
    const val = valijaDe(v);
    const pasos = CATEGORIAS.filter(c => val.items.some(i => i.categoria === c.id));
    let paso = Math.max(0, pasos.findIndex(c => val.items.some(i => i.categoria === c.id && !i.hecho)));
    const { el } = U.modal({
      titulo: 'Armemos la valija', subtitulo: 'Una categoría a la vez. Tildá lo que ya guardaste.', ancho: true, cuerpo: '<div id="armado"></div>',
      alCerrar: () => { revisarCompleta(v); R.app.refrescar(); }
    });
    const cont = el.querySelector('#armado');

    function pintar() {
      const fin = paso >= pasos.length;
      const p = progreso(v);
      if (fin) {
        const faltan = val.items.filter(i => !i.hecho);
        cont.innerHTML = `
          <div class="celebrar">
            <div class="celebrar-sol">${faltan.length ? '🧳' : '🎉'}</div>
            <h3>${faltan.length ? `Te faltan ${U.plural(faltan.length, 'cosa', 'cosas')}` : '¡Valija lista!'}</h3>
            ${faltan.length ? `<ul class="lista-faltan">${faltan.map(i => `<li>${categoria(i.categoria).icono} ${esc(i.texto)}</li>`).join('')}</ul>` : '<p>Todo guardado. Buen viaje.</p>'}
          </div>
          <div class="asistente-pie">
            <button type="button" class="btn btn-suave" data-a="atras">← Volver</button>
            <button type="button" class="btn btn-primario" data-a="cerrar">Listo</button>
          </div>`;
      } else {
        const c = pasos[paso];
        const items = val.items.filter(i => i.categoria === c.id);
        cont.innerHTML = `
          <div class="pasos-asistente">${pasos.map((x, i) => `<span class="paso-a ${i === paso ? 'actual' : ''} ${i < paso ? 'listo' : ''}"><i>${i < paso ? '✓' : x.icono}</i>${esc(x.nombre)}</span>`).join('')}</div>
          <div class="barra-progreso barra-valija"><span style="width:${p.pct}%"></span></div>
          <h3 class="titulo-paso">${c.icono} ${esc(c.nombre)}</h3>
          <ul class="lista-valija grande">${items.map(i => `
            <li class="${i.hecho ? 'hecho' : ''}"><label><input type="checkbox" data-item="${i.id}" ${i.hecho ? 'checked' : ''}><span>${esc(i.texto)}</span></label></li>`).join('')}</ul>
          <div class="fila-agregar">
            <input id="arTexto" placeholder="¿Algo más de ${esc(c.nombre.toLowerCase())}?">
            <button type="button" class="btn btn-suave" data-a="agregar">Agregar</button>
          </div>
          <div class="asistente-pie">
            <button type="button" class="btn btn-suave" data-a="atras" ${paso === 0 ? 'style="visibility:hidden"' : ''}>← Atrás</button>
            <button type="button" class="btn btn-primario" data-a="seguir">${paso === pasos.length - 1 ? 'Terminar' : 'Siguiente →'}</button>
          </div>`;
        cont.querySelectorAll('[data-item]').forEach(x => x.onchange = () => {
          val.items.find(i => i.id === x.dataset.item).hecho = x.checked;
          R.db.guardarViaje(v);
          x.closest('li').classList.toggle('hecho', x.checked);
          cont.querySelector('.barra-valija span').style.width = progreso(v).pct + '%';
        });
        const inp = cont.querySelector('#arTexto');
        const agregar = () => { if (agregarItem(v, inp.value, c.id, null)) { R.db.guardarViaje(v); pintar(); cont.querySelector('#arTexto').focus(); } };
        cont.querySelector('[data-a="agregar"]').onclick = agregar;
        inp.onkeydown = e => { if (e.key === 'Enter') agregar(); };
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
        <p class="texto-suave">Armá listas con lo que llevás siempre. En cada viaje las agregás y después sumás lo particular de ese viaje.</p>
      </section>
      <div class="acciones-fila">
        <button class="btn btn-primario" data-a="nueva">+ Nueva lista</button>
        ${!listas.some(l => l.nombre === 'Básico para cualquier viaje') ? '<button class="btn btn-suave" data-a="basica">Crear "Básico para cualquier viaje"</button>' : ''}
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
          <p>Por ejemplo: "Básico", "Playa", "Nieve", "Viaje con los chicos". Después las sumás a cualquier viaje con un toque.</p>
        </div>`}`;

    const guardar = l => { R.db.guardarListaValija(l); R.app.refrescar(); };
    app.querySelector('[data-a="nueva"]').onclick = () => {
      const l = { id: U.id('lst'), nombre: 'Nueva lista', items: [] };
      R.db.guardarListaValija(l);
      R.app.refrescar();
      setTimeout(() => { const i = document.querySelector(`[data-renombrar="${l.id}"]`); if (i) { i.focus(); i.select(); } }, 30);
    };
    const basica = app.querySelector('[data-a="basica"]');
    if (basica) basica.onclick = () => guardar({ id: U.id('lst'), nombre: 'Básico para cualquier viaje', items: BASICO.map(([categoria, texto]) => ({ id: U.id('it'), texto, categoria })) });
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

  return { render, renderMisListas, sugerencias, progreso, CATEGORIAS };
})();
