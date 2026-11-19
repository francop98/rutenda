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
  /** Categorías en orden alfabético ("Otros" siempre al final). */
  const categoriasOrdenadas = () => U.ordenAlfa(CATEGORIAS.filter(c => c.id !== 'otros'), 'nombre').concat(CATEGORIAS.filter(c => c.id === 'otros'));
  const opcionesCategoria = sel => categoriasOrdenadas().map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icono} ${c.nombre}</option>`).join('');

  /* ---------- Datos del viaje: una sola valija para todos ---------- */
  function valijaDe(v) {
    v.valijas = v.valijas || {};
    const val = v.valijas.comun = v.valijas.comun || { items: [] };
    val.items = val.items || [];
    return val;
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

  /** Lo típico de cualquier viaje: aparece solo si lo pedís. */
  const SUGERIDOS = [
    ['documentos', 'DNI o pasaporte'], ['documentos', 'Tarjetas y efectivo'], ['documentos', 'Pasajes y reservas en el celular'],
    ['ropa', 'Ropa interior'], ['ropa', 'Medias'], ['ropa', 'Remeras'], ['ropa', 'Pijama'], ['ropa', 'Abrigo'],
    ['calzado', 'Zapatillas cómodas'], ['higiene', 'Cepillo y pasta de dientes'], ['higiene', 'Desodorante'], ['higiene', 'Protector solar'],
    ['salud', 'Medicación habitual'], ['salud', 'Analgésicos'], ['electronica', 'Celular y cargador'], ['electronica', 'Batería externa'],
    ['mano', 'Auriculares'], ['otros', 'Lentes de sol']
  ];
  let verSugeridos = false;

  /* ---------- Pestaña del viaje ---------- */
  function render(v, cont) {
    const val = valijaDe(v);
    const prog = progreso(v);
    const listas = R.db.listasValija();
    const sug = SUGERIDOS.filter(([, t]) => !existe(v, t));
    const grupos = categoriasOrdenadas().map(c => ({ c, items: U.ordenAlfa(val.items.filter(i => (i.categoria || 'otros') === c.id), 'texto') })).filter(g => g.items.length);

    cont.innerHTML = `
      <div class="valija2">
        <div class="valija2-cab">
          <h2 class="titulo-seccion">Valija</h2>
          <span class="texto-suave">${prog.total ? `${prog.hechos} de ${prog.total} listos` : 'Vacía'}</span>
        </div>
        ${prog.total ? `<div class="barra-progreso barra-valija"><span style="width:${prog.pct}%"></span></div>` : ''}
        <form class="fila-agregar fila-valija" data-form="valija">
          <input id="vjTexto" placeholder="Ej: Campera de lluvia" aria-label="Agregar a la valija" autocomplete="off">
          <select id="vjCat" aria-label="Categoría">${opcionesCategoria('otros')}</select>
          <button type="submit" class="btn btn-primario">Agregar</button>
        </form>
        <div class="chips-listas">
          ${listas.map(l => `<button type="button" class="chip-lista" data-lista="${l.id}">+ ${esc(l.nombre)} <small>${l.items.length}</small></button>`).join('')}
          <a class="chip-lista chip-admin" href="#valijas">${listas.length ? '⚙️ Mis listas' : '+ Guardar mi lista de siempre'}</a>
        </div>
        ${grupos.length ? grupos.map(g => `
          <div class="bloque bloque-valija">
            <h3 class="bloque-titulo">${g.c.icono} ${esc(g.c.nombre)} <span class="contador">${g.items.filter(i => i.hecho).length}/${g.items.length}</span></h3>
            <ul class="lista-valija checklist">${g.items.map(i => `
              <li class="${i.hecho ? 'hecho' : ''}">
                <label><input type="checkbox" data-item="${i.id}" ${i.hecho ? 'checked' : ''}><span>${esc(i.texto)}</span></label>
                <button type="button" class="btn-icono" data-borrar="${i.id}" aria-label="Quitar">×</button>
              </li>`).join('')}</ul>
          </div>`).join('') : U.vacio({ icono: '🧳', titulo: 'La valija está vacía', texto: listas.length ? 'Sumá tu lista de siempre o escribí lo que quieras arriba.' : 'Escribí lo que llevás. Si guardás tu lista de siempre, la sumás a cada viaje con un toque.', chico: true })}
        <button type="button" class="btn-texto-mini" data-a="sugeridos">${verSugeridos ? 'Ocultar sugerencias' : '¿Se te olvida algo? Ver sugerencias'}</button>
        ${verSugeridos ? `<div class="chips-elegir chips-chicos">${sug.map(([c, t], i) => `<button type="button" class="chip-op" data-sug="${i}">+ ${esc(t)}</button>`).join('') || '<span class="texto-suave">Ya tenés todo lo típico.</span>'}</div>` : ''}
      </div>`;

    const guardar = msg => { R.db.guardarViaje(v); render(v, cont); if (msg) U.toast(msg); };
    const form = cont.querySelector('[data-form="valija"]');
    form.onsubmit = e => {
      e.preventDefault();
      const t = form.querySelector('#vjTexto').value.trim();
      if (!t) return;
      if (!agregarItem(v, t, form.querySelector('#vjCat').value, null)) { U.toast('Eso ya está en la valija.'); return; }
      guardar();
      const i = cont.querySelector('#vjTexto'); if (i) i.focus();
    };
    cont.querySelectorAll('[data-item]').forEach(x => x.onchange = () => {
      const it = val.items.find(i => i.id === x.dataset.item);
      if (it) it.hecho = x.checked;
      guardar(prog.total && val.items.every(i => i.hecho) ? '¡Valija lista! 🧳' : '');
    });
    cont.querySelectorAll('[data-borrar]').forEach(x => x.onclick = () => { val.items = val.items.filter(i => i.id !== x.dataset.borrar); guardar(); });
    cont.querySelectorAll('[data-lista]').forEach(x => x.onclick = () => {
      const l = R.db.listasValija().find(y => y.id === x.dataset.lista);
      if (!l) return;
      let n = 0;
      l.items.forEach(it => { if (agregarItem(v, it.texto, it.categoria, l.id)) n++; });
      guardar(n ? `Sumé ${U.plural(n, 'cosa', 'cosas')} de "${l.nombre}".` : `Todo lo de "${l.nombre}" ya estaba.`);
    });
    cont.querySelector('[data-a="sugeridos"]').onclick = () => { verSugeridos = !verSugeridos; render(v, cont); };
    cont.querySelectorAll('[data-sug]').forEach(x => x.onclick = () => { const [c, t] = sug[Number(x.dataset.sug)]; agregarItem(v, t, c, null); guardar(); });
  }

  let creandoLista = false;
  function renderMisListas(app, alCambiar) {
    const refrescar = () => (alCambiar ? alCambiar() : R.app.refrescar());
    const listas = R.db.listasValija();
    app.innerHTML = `
      <section class="encabezado-simple">
        <h1>Mis listas</h1>
        <p class="texto-suave">Lo que llevás siempre y lo que siempre tenés que hacer antes de viajar. En cada viaje las sumás con un toque.</p>
      </section>
      <h2 class="titulo-seccion listas-sub">🧳 Para la valija</h2>
      <div class="acciones-fila">
        ${creandoLista ? '' : '<button class="btn btn-primario" data-a="nueva">+ Nueva lista</button>'}
      </div>
      ${creandoLista ? `
        <form class="bloque nueva-lista" data-form="nuevaLista">
          <label class="campo"><span>Nombre de la lista nueva</span><input id="nlNombre" placeholder="Ej: Playa, Nieve, Trabajo" maxlength="40" autocomplete="off"></label>
          <div class="acciones-fila">
            <button type="button" class="btn btn-texto" data-a="cancelarLista">Cancelar</button>
            <button type="submit" class="btn btn-primario">✓ Crear lista</button>
          </div>
        </form>` : ''}
      ${listas.length ? `<div class="grilla-listas">${listas.map(l => `
        <article class="bloque lista-personal" data-id="${l.id}">
          <div class="bloque-cab">
            <input class="titulo-lista" data-renombrar="${l.id}" value="${esc(l.nombre)}" aria-label="Nombre de la lista">
            <button class="btn-icono" data-eliminar="${l.id}" title="Eliminar lista">🗑</button>
          </div>
          ${categoriasOrdenadas().filter(c => l.items.some(i => i.categoria === c.id)).map(c => `
            <div class="lp-grupo"><small>${c.icono} ${esc(c.nombre)}</small>
              <ul class="lista-chips">${U.ordenAlfa(l.items.filter(i => i.categoria === c.id), 'texto').map(i => `<li>${esc(i.texto)} <button data-quitar="${l.id}|${i.id}" aria-label="Quitar">×</button></li>`).join('')}</ul>
            </div>`).join('') || '<p class="texto-suave">Lista vacía.</p>'}
          <div class="fila-agregar fila-valija">
            <input data-texto="${l.id}" placeholder="Agregar a esta lista">
            <select data-cat="${l.id}">${opcionesCategoria('otros')}</select>
            <button class="btn btn-suave" data-agregar="${l.id}">+</button>
          </div>
        </article>`).join('')}</div>` : `
        ${creandoLista ? '' : U.vacio({ icono: '📝', titulo: 'Todavía no tenés listas', texto: 'Por ejemplo “Playa” o “Nieve”. Después la sumás a cualquier viaje con un toque.', boton: '+ Crear mi primera lista', accion: 'nueva', chico: true })}`}
      ${pendientesHTML()}`;
    enlazarPendientes(app, refrescar);

    const guardar = l => { R.db.guardarListaValija(l); refrescar(); };
    // Nueva lista: primero el nombre y después "Crear lista" (nada se crea sin confirmar)
    app.querySelectorAll('[data-a="nueva"]').forEach(bN => bN.onclick = () => {
      creandoLista = true;
      renderMisListas(app, alCambiar);
      setTimeout(() => { const i = app.querySelector('#nlNombre'); if (i) i.focus(); }, 30);
    });
    const fNueva = app.querySelector('[data-form="nuevaLista"]');
    if (fNueva) {
      fNueva.onsubmit = e => {
        e.preventDefault();
        const nombre = fNueva.querySelector('#nlNombre').value.trim();
        if (!nombre) { U.toast('Poné un nombre para la lista.'); fNueva.querySelector('#nlNombre').focus(); return; }
        if (R.db.listasValija().some(x => normal(x.nombre) === normal(nombre))) { U.toast('Ya tenés una lista con ese nombre.'); return; }
        const l = { id: U.id('lst'), nombre, items: [] };
        creandoLista = false;
        R.db.guardarListaValija(l);
        U.toast(`Lista "${nombre}" creada. Sumale lo que llevás siempre.`);
        refrescar();
        setTimeout(() => { const i = document.querySelector(`[data-texto="${l.id}"]`); if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); } }, 40);
      };
      fNueva.querySelector('[data-a="cancelarLista"]').onclick = () => { creandoLista = false; renderMisListas(app, alCambiar); };
    }
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
      refrescar();
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

  /* ---------- Listas de pendientes de siempre ---------- */
  const listasPend = () => (R.db.prefs().listasPendientes || []).slice();
  const guardarListasPend = l => R.db.guardarPrefs({ listasPendientes: l });
  function pendientesHTML() {
    const ls = listasPend();
    return `
      <h2 class="titulo-seccion listas-sub">✅ Pendientes de siempre</h2>
      <p class="texto-suave">Por ejemplo "Antes de cada viaje": avisar al banco, regar las plantas, sacar el seguro…</p>
      <div class="grilla-listas">${ls.map(l => `
        <article class="bloque lista-personal">
          <div class="bloque-cab">
            <input class="titulo-lista" data-pren="${l.id}" value="${esc(l.nombre)}" aria-label="Nombre de la lista">
            <button class="btn-icono" data-pelim="${l.id}" title="Eliminar lista">🗑</button>
          </div>
          <ul class="lista-chips">${(l.items || []).map((t, i) => `<li>${esc(t)} <button data-pquitar="${l.id}|${i}" aria-label="Quitar">×</button></li>`).join('') || '<li class="texto-suave">Vacía</li>'}</ul>
          <form class="fila-agregar" data-pform="${l.id}"><input placeholder="Agregar un pendiente" autocomplete="off"><button class="btn btn-suave" type="submit">+</button></form>
        </article>`).join('')}</div>
      <form class="fila-agregar nueva-lista-pend" data-pform="nueva"><input placeholder="Nombre de una lista nueva (ej: Antes de cada viaje)" autocomplete="off"><button class="btn btn-primario" type="submit">+ Crear</button></form>`;
  }
  function enlazarPendientes(app, refrescar) {
    app.querySelectorAll('[data-pform]').forEach(f => f.onsubmit = e => {
      e.preventDefault();
      const t = f.querySelector('input').value.trim();
      if (!t) return;
      const ls = listasPend();
      if (f.dataset.pform === 'nueva') ls.push({ id: U.id('lpe'), nombre: t, items: [] });
      else { const l = ls.find(x => x.id === f.dataset.pform); if (l && !(l.items || []).some(x => normal(x) === normal(t))) l.items = (l.items || []).concat([t]); }
      guardarListasPend(ls);
      refrescar();
      setTimeout(() => { const i = document.querySelector(`[data-pform="${f.dataset.pform === 'nueva' ? ls[ls.length - 1].id : f.dataset.pform}"] input`); if (i) i.focus(); }, 30);
    });
    app.querySelectorAll('[data-pquitar]').forEach(b => b.onclick = () => {
      const [id, i] = b.dataset.pquitar.split('|');
      const ls = listasPend(); const l = ls.find(x => x.id === id);
      if (l) { l.items = l.items.filter((_, k) => k !== Number(i)); guardarListasPend(ls); refrescar(); }
    });
    app.querySelectorAll('[data-pren]').forEach(x => x.onchange = () => {
      const ls = listasPend(); const l = ls.find(y => y.id === x.dataset.pren);
      if (l) { l.nombre = x.value.trim() || 'Lista'; guardarListasPend(ls); U.toast('Nombre guardado.'); }
    });
    app.querySelectorAll('[data-pelim]').forEach(b => b.onclick = async () => {
      const ls = listasPend(); const l = ls.find(y => y.id === b.dataset.pelim);
      if (!l || !await U.confirmar(`¿Eliminar la lista "${l.nombre}"?`, { textoSi: 'Eliminar', peligro: true })) return;
      guardarListasPend(ls.filter(y => y.id !== l.id)); refrescar();
    });
  }

  /** Suma algo a tu valija de un viaje y lo guarda. Devuelve false si ya estaba. */
  function agregar(v, texto, cat) {
    if (!agregarItem(v, texto, cat || 'otros', null)) return false;
    R.db.guardarViaje(v);
    return true;
  }

  return { render, renderMisListas, progreso, valijaDe, agregar, CATEGORIAS };
})();
