/* =========================================================
   Rutenda — Pendientes
   Dos listas que escribís vos:
   - Por hacer: lo que tenés que resolver. Si le ponés fecha,
     se ordena por fecha; si le pedís aviso, te llega ese día.
   - Quiero hacer allá: ideas. Cuando sepas qué día, la pasás
     al itinerario con un toque.
   Tus listas de siempre (las guardás una vez) se suman con un
   toque. Las sugerencias aparecen solo si las pedís.
   ========================================================= */
window.R = window.R || {};

R.pendientes = (function () {
  const U = R.util;
  const { esc } = U;
  const A = () => R.agenda;

  const SUGERENCIAS = [
    'Sacar el seguro de viaje', 'Avisar al banco que viajo', 'Revisar que el DNI o pasaporte no venza',
    'Descargar el mapa sin conexión', 'Cambiar plata o cargar la tarjeta', 'Hacer el check-in online',
    'Imprimir o bajar los vouchers', 'Dejar a alguien a cargo de las plantas o la mascota',
    'Avisar a la familia el itinerario', 'Cargar la SUBE o la tarjeta de transporte'
  ];
  let verSugerencias = false;
  let verHechos = false;

  function lista(v) { return v.pendientes || (v.pendientes = []); }
  function faltan(v) { return lista(v).filter(p => !p.hecho).length; }
  /** Por hacer: primero lo que tiene fecha (la más cercana arriba), después lo demás; lo hecho al final. */
  function ordenados(v) {
    const peso = p => p.fecha ? '0' + p.fecha : '1';
    return lista(v).filter(p => !p.hecho).sort((a, b) => peso(a).localeCompare(peso(b)) || String(a.creado || '').localeCompare(String(b.creado || '')));
  }
  function cuando(p) {
    if (!p.fecha) return '';
    const d = U.diasEntre(U.hoyISO(), p.fecha);
    const txt = d < 0 ? `venció el ${U.fmtFecha(p.fecha, 'corto')}` : d === 0 ? 'hoy' : d === 1 ? 'mañana' : U.fmtFecha(p.fecha, 'dia');
    return txt + (p.aviso ? ' · 🔔' : '');
  }
  function listasGuardadas() { return R.db.prefs().listasPendientes || []; }

  function render(v, cont) {
    const puede = R.db.puedeOrganizar(v);
    const pend = ordenados(v);
    const hechos = lista(v).filter(p => p.hecho);
    const ideas = A().ideas(v);
    const yaEstan = new Set(lista(v).map(p => p.texto.toLowerCase()));
    const sug = SUGERENCIAS.filter(t => !yaEstan.has(t.toLowerCase()));
    const guardadas = listasGuardadas();
    cont.innerHTML = `
      <div class="pend2">
        <section class="bloque pend2-bloque">
          <div class="pend2-cab"><h2 class="titulo-seccion">Por hacer</h2><span class="texto-suave">${hechos.length} de ${lista(v).length} listos</span></div>
          ${puede ? `<form class="pend2-nuevo" data-form="pend">
            <input id="pTexto" placeholder="Ej: Sacar el seguro" aria-label="Nuevo pendiente" autocomplete="off">
            <button type="submit" class="btn btn-primario" aria-label="Agregar">+</button>
          </form>` : ''}
          ${puede && R.armar ? R.armar.faltaHTML(v) : ''}
          ${requisitosHTML(v)}
          ${pend.length ? `<div class="pend2-lista">${pend.map(p => filaHTML(p, puede)).join('')}</div>` : `<p class="texto-suave pend2-vacio">${hechos.length ? '¡Nada pendiente! 🎉' : 'Anotá lo que tengas que resolver antes o durante el viaje.'}</p>`}
          ${hechos.length ? `
            <button type="button" class="btn-texto-mini" data-a="hechos">${verHechos ? 'Ocultar' : 'Ver'} lo hecho (${hechos.length})</button>
            ${verHechos ? `<div class="pend2-lista pend2-hechos">${hechos.map(p => filaHTML(p, puede)).join('')}</div>` : ''}` : ''}
          ${puede ? `<div class="pend2-extras">
            ${guardadas.length ? guardadas.map(l => `<button type="button" class="chip-op" data-usar-lista="${l.id}">＋ ${esc(l.nombre)}</button>`).join('') : ''}
            <button type="button" class="btn-texto-mini" data-a="sugerencias">${verSugerencias ? 'Ocultar sugerencias' : '¿Se te olvida algo? Ver sugerencias'}</button>
          </div>
          ${verSugerencias ? `<div class="chips-elegir chips-chicos pend2-sug">${sug.map(t => `<button type="button" class="chip-op" data-sumar="${esc(t)}">+ ${esc(t)}</button>`).join('') || '<span class="texto-suave">Ya tenés todas.</span>'}</div>` : ''}` : ''}
        </section>

        <section class="bloque pend2-bloque">
          <div class="pend2-cab"><h2 class="titulo-seccion">Quiero hacer allá</h2></div>
          <p class="texto-suave pend2-ayuda">Anotá ideas: lugares, comidas, excursiones. Cuando sepas qué día, tocá "Elegir día" y pasa al itinerario.</p>
          ${puede ? `<form class="pend2-nuevo" data-form="idea">
            <input id="iTextoIdea" placeholder="Ej: Cerro Catedral" aria-label="Nueva idea" autocomplete="off">
            <button type="submit" class="btn btn-terracota" aria-label="Agregar idea">+</button>
          </form>` : ''}
          ${ideas.length ? `<div class="pend2-ideas">${ideas.map(i => `
            <div class="idea2">
              <button type="button" class="idea2-texto" data-idea="${i.id}"><span aria-hidden="true">${A().tipo(i.tipo).icono}</span><span><strong>${esc(i.titulo)}</strong>${i.nota || i.lugar ? `<small>${esc(i.nota || i.lugar)}</small>` : ''}</span></button>
              ${puede ? `<button type="button" class="btn btn-suave btn-chico" data-elegir-dia="${i.id}">Elegir día</button>` : ''}
            </div>`).join('')}</div>` : `<p class="texto-suave pend2-vacio">${A().items(v).length ? 'Todas tus ideas ya tienen día. Miralas en el Itinerario.' : 'Todavía no anotaste ideas.'}</p>`}
        </section>
      </div>`;
    enlazar(v, cont);
  }

  /** Viajes al exterior: lo que hay que tramitar (visa, pasaporte, vacunas), con link a los requisitos. */
  function requisitosHTML(v) {
    const r = R.requisitos ? R.requisitos.resumen(v) : null;
    if (!r) return '';
    return `
      <div class="falta-armar req-pend">
        <strong>Para entrar al país</strong>
        <a class="falta-fila" href="#viaje/${v.id}/documentos"><span aria-hidden="true">🛂</span><span>${esc(r.titulo)}<small>${esc(r.partes.length ? r.partes.join(' · ') : 'Nada para tramitar. Mirá el detalle.')}</small></span><b>Ver</b></a>
      </div>`;
  }

  function filaHTML(p, puede) {
    const c = cuando(p);
    const vencido = p.fecha && !p.hecho && p.fecha < U.hoyISO();
    return `
      <div class="pend2-fila ${p.hecho ? 'hecho' : ''} ${vencido ? 'vencido' : ''}">
        <button type="button" class="pend2-check" data-tildar="${p.id}" aria-pressed="${!!p.hecho}" aria-label="${p.hecho ? 'Desmarcar' : 'Marcar como hecho'}" ${puede ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>
        </button>
        <button type="button" class="pend2-texto" data-editar="${p.id}" ${puede ? '' : 'disabled'}>
          <span>${esc(p.texto)}</span>${c ? `<small>${esc(c)}</small>` : ''}
        </button>
      </div>`;
  }

  function enlazar(v, cont) {
    const guardar = () => { R.db.guardarViaje(v); render(v, cont); if (R.recordatorios) R.recordatorios.actualizar(); };
    const fp = cont.querySelector('[data-form="pend"]');
    if (fp) fp.onsubmit = e => {
      e.preventDefault();
      const t = fp.querySelector('input').value.trim();
      if (!t) return;
      lista(v).push({ id: U.id('pe'), texto: t, hecho: false, fecha: '', creado: new Date().toISOString() });
      guardar();
      const i = cont.querySelector('#pTexto'); if (i) i.focus();
    };
    const fi = cont.querySelector('[data-form="idea"]');
    if (fi) fi.onsubmit = e => {
      e.preventDefault();
      const t = fi.querySelector('input').value.trim();
      if (!t) return;
      A().guardarItem(v, A().nuevoItem({ titulo: t, fecha: '' }));
      R.db.guardarViaje(v); render(v, cont);
      const i = cont.querySelector('#iTextoIdea'); if (i) i.focus();
    };
    cont.querySelectorAll('[data-tildar]').forEach(b => b.onclick = () => {
      const p = lista(v).find(x => x.id === b.dataset.tildar);
      if (!p) return;
      p.hecho = !p.hecho;
      guardar();
    });
    cont.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editar(v, b.dataset.editar, () => render(v, cont)));
    const bh = cont.querySelector('[data-a="hechos"]');
    if (bh) bh.onclick = () => { verHechos = !verHechos; render(v, cont); };
    const bs = cont.querySelector('[data-a="sugerencias"]');
    if (bs) bs.onclick = () => { verSugerencias = !verSugerencias; render(v, cont); };
    cont.querySelectorAll('[data-sumar]').forEach(b => b.onclick = () => {
      lista(v).push({ id: U.id('pe'), texto: b.dataset.sumar, hecho: false, fecha: '', creado: new Date().toISOString() });
      guardar();
    });
    cont.querySelectorAll('[data-usar-lista]').forEach(b => b.onclick = () => {
      const l = listasGuardadas().find(x => x.id === b.dataset.usarLista);
      if (!l) return;
      const ya = new Set(lista(v).map(p => p.texto.toLowerCase()));
      const nuevos = (l.items || []).filter(t => !ya.has(String(t).toLowerCase()));
      nuevos.forEach(t => lista(v).push({ id: U.id('pe'), texto: t, hecho: false, fecha: '', creado: new Date().toISOString() }));
      guardar();
      U.toast(nuevos.length ? `Sumé ${U.plural(nuevos.length, 'pendiente', 'pendientes')} de "${l.nombre}".` : 'Ya los tenías todos.');
    });
    cont.querySelectorAll('[data-idea]').forEach(b => b.onclick = () => R.itinerario.editarItem(v, b.dataset.idea));
    cont.querySelectorAll('[data-elegir-dia]').forEach(b => b.onclick = () => {
      if (!A().dias(v).length) { U.toast('Primero poné las fechas del viaje.'); return; }
      R.itinerario.mover(v, b.dataset.elegirDia, () => render(v, cont));
    });
  }

  function editar(v, id, alTerminar) {
    const p = lista(v).find(x => x.id === id);
    if (!p) return;
    const { el } = U.modal({
      titulo: 'Pendiente',
      cuerpo: `
        <label class="campo"><span>Qué</span><input id="peTexto" value="${esc(p.texto)}"></label>
        <label class="campo"><span>Para cuándo <small>(opcional)</small></span><input type="date" id="peFecha" value="${esc(p.fecha || '')}"></label>
        <label class="check"><input type="checkbox" id="peAviso" ${p.aviso ? 'checked' : ''}> Avisame ese día al celular</label>`,
      acciones: [
        { texto: 'Borrar', clase: 'btn-texto peligro', onClick: () => { v.pendientes = lista(v).filter(x => x.id !== id); R.db.guardarViaje(v); alTerminar(); } },
        { texto: 'Cancelar' },
        { texto: 'Guardar', clase: 'btn-primario', onClick: f => {
          const t = f.querySelector('#peTexto').value.trim();
          if (!t) { U.toast('Escribí el pendiente.'); return false; }
          p.texto = t; p.fecha = f.querySelector('#peFecha').value; p.aviso = !!(p.fecha && f.querySelector('#peAviso').checked);
          R.db.guardarViaje(v);
          if (R.recordatorios) R.recordatorios.actualizar();
          alTerminar();
        } }
      ]
    });
    const fe = el.querySelector('#peFecha'), av = el.querySelector('#peAviso');
    const sync = () => { av.disabled = !fe.value; if (!fe.value) av.checked = false; };
    fe.addEventListener('change', sync); sync();
  }

  /** Para "Cargar" y otros lugares: sumar un pendiente o una idea rápido. */
  function sumar(v, texto) { lista(v).push({ id: U.id('pe'), texto, hecho: false, fecha: '', creado: new Date().toISOString() }); }

  return { render, faltan, sumar, SUGERENCIAS, listasGuardadas };
})();
